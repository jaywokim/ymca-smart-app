// This file contains functions for handling and displaying error messages to the user, ensuring a smooth user experience during failures.

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
        <div style="
            position: fixed; 
            top: 20px; 
            right: 20px; 
            background: #ef4444; 
            color: white; 
            padding: 16px 24px; 
            border-radius: 8px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-width: 400px;
        ">
            <div style="font-weight: bold; margin-bottom: 8px;">❌ Error Occurred</div>
            <div style="font-size: 14px;">
                Error: ${message}
            </div>
        </div>
    `;
    document.body.appendChild(errorDiv);
    
    // Auto-remove after 7 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 7000);
}

export { showError };