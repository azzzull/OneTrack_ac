const EXCEL_MIME_TYPE =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const parseExcelDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const makeExcelFileName = (parts) =>
    `${parts
        .filter(Boolean)
        .join(" ")
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}.xlsx`;

export const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const getCellTextLength = (value) => {
    if (value instanceof Date) return 10;
    if (value === null || value === undefined) return 1;
    return String(value?.text ?? value).length;
};

export const exportStyledExcel = async ({
    fileName,
    sheetName,
    title,
    filterRows = [],
    columns,
    rows,
    summaryTitle = "Ringkasan",
    summaryRows = [],
    dateKeys = [],
    currencyKeys = [],
    wrapKeys = [],
}) => {
    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OneTrack";
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ state: "frozen", ySplit: filterRows.length + 4 }],
    });
    worksheet.properties.defaultRowHeight = 18;

    const headerRowNumber = filterRows.length + 4;
    const lastColumnNumber = columns.length;

    worksheet.mergeCells(1, 1, 1, lastColumnNumber);
    const titleCell = worksheet.getRow(1).getCell(1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 18, color: { argb: "FF0F172A" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 28;

    filterRows.forEach(([label, value], index) => {
        const row = worksheet.getRow(index + 3);
        row.getCell(1).value = label;
        row.getCell(2).value = value;
        row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
        row.getCell(2).alignment = { vertical: "middle", wrapText: true };
        if (value instanceof Date) row.getCell(2).numFmt = "dd/mm/yyyy";
    });

    const headerRow = worksheet.getRow(headerRowNumber);
    columns.forEach((column, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = column.header;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF0284C7" },
        };
        cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
        };
        cell.border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
    });
    headerRow.height = 24;

    rows.forEach((rowData, rowIndex) => {
        const row = worksheet.getRow(headerRowNumber + 1 + rowIndex);
        columns.forEach((column, columnIndex) => {
            const cell = row.getCell(columnIndex + 1);
            cell.value = rowData[column.key] ?? "-";
            cell.alignment = {
                vertical: "top",
                wrapText: wrapKeys.includes(column.key),
            };
            cell.border = {
                top: { style: "thin", color: { argb: "FFE2E8F0" } },
                left: { style: "thin", color: { argb: "FFE2E8F0" } },
                bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
                right: { style: "thin", color: { argb: "FFE2E8F0" } },
            };
            if (rowIndex % 2 === 1) {
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FFF8FAFC" },
                };
            }
            if (dateKeys.includes(column.key)) cell.numFmt = "dd/mm/yyyy";
            if (currencyKeys.includes(column.key)) cell.numFmt = '"Rp" #,##0';
        });
    });

    const dataEndRowNumber = headerRowNumber + rows.length;
    worksheet.autoFilter = {
        from: { row: headerRowNumber, column: 1 },
        to: { row: dataEndRowNumber, column: lastColumnNumber },
    };

    if (summaryRows.length > 0) {
        const summaryStartRow = dataEndRowNumber + 3;
        worksheet.mergeCells(summaryStartRow, 1, summaryStartRow, 2);
        const summaryCell = worksheet.getRow(summaryStartRow).getCell(1);
        summaryCell.value = summaryTitle;
        summaryCell.font = {
            bold: true,
            size: 13,
            color: { argb: "FF0F172A" },
        };

        summaryRows.forEach(([label, value, type], index) => {
            const row = worksheet.getRow(summaryStartRow + 1 + index);
            row.getCell(1).value = label;
            row.getCell(2).value = value;
            row.getCell(1).font = { bold: true };
            if (type === "currency") row.getCell(2).numFmt = '"Rp" #,##0';
            if (type === "date") row.getCell(2).numFmt = "dd/mm/yyyy";
            [1, 2].forEach((columnNumber) => {
                const cell = row.getCell(columnNumber);
                cell.border = {
                    top: { style: "thin", color: { argb: "FFCBD5E1" } },
                    left: { style: "thin", color: { argb: "FFCBD5E1" } },
                    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
                    right: { style: "thin", color: { argb: "FFCBD5E1" } },
                };
                cell.alignment = { vertical: "middle" };
            });
        });
    }

    worksheet.columns.forEach((worksheetColumn, index) => {
        const column = columns[index];
        let maxLength = getCellTextLength(column?.header);
        worksheetColumn.eachCell({ includeEmpty: true }, (cell) => {
            maxLength = Math.max(maxLength, getCellTextLength(cell.value));
        });
        const isLongColumn = wrapKeys.includes(column?.key);
        worksheetColumn.width = Math.min(
            Math.max(maxLength + 2, isLongColumn ? 24 : 12),
            isLongColumn ? 52 : 28,
        );
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: EXCEL_MIME_TYPE }), fileName);
};
