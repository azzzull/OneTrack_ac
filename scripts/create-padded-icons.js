/**
 * Script to create padded square icons from non-square logos
 * This is a conceptual script showing the approach - actual implementation
 * would require image processing libraries like Sharp for Node.js
 */

// This is a placeholder script demonstrating the concept
// In a real implementation, you would use an image processing library

console.log("Padded Square Icon Creation Script");
console.log("==================================");
console.log("");

function createPaddedIcon(originalWidth, originalHeight, targetSize) {
    console.log(
        `Creating ${targetSize}x${targetSize} icon from ${originalWidth}x${originalHeight} logo`,
    );

    // Calculate aspect ratio
    const aspectRatio = originalWidth / originalHeight;

    let scaledWidth, scaledHeight, paddingX, paddingY;

    if (aspectRatio > 1) {
        // Wider than tall (landscape)
        scaledWidth = targetSize;
        scaledHeight = Math.round(targetSize / aspectRatio);
        paddingX = 0;
        paddingY = Math.round((targetSize - scaledHeight) / 2);
    } else {
        // Taller than wide or square
        scaledHeight = targetSize;
        scaledWidth = Math.round(targetSize * aspectRatio);
        paddingX = Math.round((targetSize - scaledWidth) / 2);
        paddingY = 0;
    }

    console.log(`  - Scaled logo size: ${scaledWidth}x${scaledHeight}`);
    console.log(
        `  - Padding: ${paddingX}px left/right, ${paddingY}px top/bottom`,
    );
    console.log(`  - Final canvas: ${targetSize}x${targetSize} (square)`);
    console.log("");

    return {
        canvasSize: targetSize,
        logoSize: { width: scaledWidth, height: scaledHeight },
        padding: { x: paddingX, y: paddingY },
    };
}

// Example usage:
console.log("Example: Logo with 3:1 aspect ratio (600x200)");
console.log("---------------------------------------------");
createPaddedIcon(600, 200, 512);

console.log("Example: Logo with 1:2 aspect ratio (200x400)");
console.log("---------------------------------------------");
createPaddedIcon(200, 400, 512);

console.log("Example: Square logo (300x300)");
console.log("-------------------------------");
createPaddedIcon(300, 300, 512);

console.log("");
console.log("Implementation Notes:");
console.log(
    "- Use an image processing library like Sharp (Node.js) for actual implementation",
);
console.log("- Maintain original aspect ratio when scaling");
console.log("- Center the scaled logo on the square canvas");
console.log(
    "- Use transparent or colored padding as appropriate for your brand",
);
console.log("- Consider different padding for different icon sizes if needed");
