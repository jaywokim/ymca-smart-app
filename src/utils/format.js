// src/utils/format.js

/**
 * Format date for display
 * @param {string} dateString - The date string to format
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

export { formatDate };