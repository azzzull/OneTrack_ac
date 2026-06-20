const TOAST_WIDTH = 352;

const getVisibleNotificationAnchor = () =>
    [...document.querySelectorAll("[data-notification-anchor]")].find(
        (element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        },
    );

export const getToastPosition = () => {
    const viewportWidth = window.innerWidth;
    const width = Math.min(TOAST_WIDTH, viewportWidth - 24);

    if (viewportWidth < 768) {
        return {
            left: "50%",
            top: "80px",
            width: `${width}px`,
            transform: "translateX(-50%)",
        };
    }

    const rect = getVisibleNotificationAnchor()?.getBoundingClientRect();
    return {
        left: `${Math.min(Math.max(12, rect?.left ?? viewportWidth - width - 16), viewportWidth - width - 12)}px`,
        top: `${rect?.bottom ?? 16}px`,
        width: `${width}px`,
        transform: "none",
    };
};

export const observeToastPosition = (element) => {
    if (!element) return () => {};
    const update = () => Object.assign(element.style, getToastPosition());
    const frameId = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
    };
};
