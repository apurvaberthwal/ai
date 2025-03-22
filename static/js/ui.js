/**
 * UI module handling user interface interactions
 */

// DOM elements
let chatContainer, loadingMessage;
let successAlert, successMessage, errorAlert, errorMessage;
let uploadSection, interviewSection, insightsPanel;
let currentAssistantMessageDiv = null;
let closeAlertButtons;

/**
 * Initialize UI components
 */
function initUI() {
    // Initialize DOM references
    chatContainer = document.getElementById('chat-container');
    loadingMessage = document.getElementById('loading-message');
    successAlert = document.getElementById('success-alert');
    successMessage = document.getElementById('success-message');
    errorAlert = document.getElementById('error-alert');
    errorMessage = document.getElementById('error-message');
    uploadSection = document.getElementById('upload-section');
    interviewSection = document.getElementById('interview-section');
    insightsPanel = document.getElementById('insights-panel');
    closeAlertButtons = document.querySelectorAll('.close-alert');
    
    // Set up alert close buttons
    closeAlertButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.parentElement.style.display = 'none';
        });
    });
    
    // Add some keyboard navigation for accessibility
    document.addEventListener('keydown', handleKeyboardNavigation);
}

/**
 * Handle keyboard navigation for accessibility
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeyboardNavigation(e) {
    // Escape key closes alerts
    if (e.key === 'Escape') {
        if (successAlert.style.display === 'block') {
            successAlert.style.display = 'none';
        }
        if (errorAlert.style.display === 'block') {
            errorAlert.style.display = 'none';
        }
    }
}

/**
 * Show success message
 * @param {string} message - Message to display
 * @param {number} duration - How long to show the message (ms)
 */
function showSuccess(message, duration = 3000) {
    successMessage.textContent = message;
    successAlert.style.display = 'block';
    
    // Focus for screen readers
    successAlert.setAttribute('tabindex', '-1');
    successAlert.focus();
    
    // Auto-dismiss after duration
    if (duration) {
        setTimeout(() => {
            successAlert.style.display = 'none';
        }, duration);
    }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 * @param {number} duration - How long to show the message (ms)
 */
function showError(message, duration = 5000) {
    errorMessage.textContent = message;
    errorAlert.style.display = 'block';
    
    // Focus for screen readers
    errorAlert.setAttribute('tabindex', '-1');
    errorAlert.focus();
    
    // Auto-dismiss after duration
    if (duration) {
        setTimeout(() => {
            errorAlert.style.display = 'none';
        }, duration);
    }
}

/**
 * Show loading indicator
 */
function showLoading() {
    if (loadingMessage) {
        loadingMessage.style.display = 'block';
        loadingMessage.setAttribute('aria-hidden', 'false');
    }
}

/**
 * Hide loading indicator
 */
function hideLoading() {
    if (loadingMessage) {
        loadingMessage.style.display = 'none';
        loadingMessage.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Display assistant message in chat
 * @param {Object} message - Message data
 * @returns {HTMLElement} The created message div
 */
function displayAssistantMessage(message) {
    // Clean and format content - remove leading/trailing whitespace 
    // and ensure we have content to display
    if (!message.content) {
        console.error("Empty message content in displayAssistantMessage:", message);
        message.content = "No message content";
    }
    
    const content = message.content.trim();
    console.log("Displaying assistant message:", content);
    
    hideLoading();
    
    // Get current voice style to display
    const currentVoice = document.getElementById('voice-style').value;
    console.log(`Current voice style: ${currentVoice}`);

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant assistant-message-container';
    messageDiv.innerHTML = `
        <p>${content}</p>
        <div class="listening-animation" aria-hidden="true"></div>
        <div class="voice-badge" title="Voice style">${currentVoice}</div>
    `;
    
    // Announce message for screen readers
    const srAnnounce = document.createElement('span');
    srAnnounce.className = 'sr-only';
    srAnnounce.textContent = `Assistant says: ${content}`;
    messageDiv.appendChild(srAnnounce);
    
    chatContainer.appendChild(messageDiv);
    currentAssistantMessageDiv = messageDiv;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    startSpeakingAnimation();
    return messageDiv;
}

/**
 * Display user message in chat
 * @param {string} content - Message content
 * @returns {HTMLElement} The created message div
 */
function displayUserMessage(content) {
    console.log("Displaying user message:", content);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.innerHTML = `<p>${content}</p>`;
    
    // For screen readers
    messageDiv.setAttribute('role', 'comment');
    messageDiv.setAttribute('aria-label', `You said: ${content}`);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return messageDiv;
}

/**
 * Display placeholder user message while recording
 * @param {string} placeholder - Placeholder text
 * @returns {HTMLElement} The created message div
 */
function displayUserPlaceholder(placeholder = '[ Listening... ]') {
    console.log("Displaying user placeholder:", placeholder);
    
    // Remove any existing placeholders first
    const placeholderMessages = document.querySelectorAll('.message.user');
    for (const msg of placeholderMessages) {
        if (msg.textContent.includes('[ Listening... ]')) {
            msg.remove();
        }
    }
    
    return displayUserMessage(placeholder);
}

/**
 * Update user transcription in the most recent user message
 * @param {string} transcription - Text transcription
 */
function displayUserTranscription(transcription) {
    const userMessages = chatContainer.querySelectorAll('.message.user');
    if (userMessages.length > 0) {
        // Find the most recent message that has the listening placeholder
        let lastUserMessage = null;
        for (let i = userMessages.length - 1; i >= 0; i--) {
            if (userMessages[i].textContent.includes('[ Listening... ]')) {
                lastUserMessage = userMessages[i];
                break;
            }
        }
        
        // If we found a placeholder, update it
        if (lastUserMessage) {
            lastUserMessage.querySelector('p').textContent = transcription;
            
            // Update aria-label for screen readers
            lastUserMessage.setAttribute('aria-label', `You said: ${transcription}`);
        } else {
            // If no placeholder found, log warning
            console.warn("No placeholder message found to update with transcription");
        }
    } else {
        console.warn("No user messages found in chat");
    }
}

/**
 * Display system message
 * @param {Object} message - Message data
 */
function displaySystemMessage(message) {
    hideLoading();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.setAttribute('role', 'alert');
    messageDiv.innerHTML = `<p>${message.content}</p>`;
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Display message based on role
 * @param {Object} message - Message data
 */
function displayMessage(message) {
    console.log("Display message called with:", message);
    
    if (!message) {
        console.error("Null or undefined message passed to displayMessage");
        return;
    }
    
    if (!message.role) {
        console.error("Message missing role:", message);
        message.role = "system";
    }
    
    if (!message.content) {
        console.error("Message missing content:", message);
        message.content = "Empty message";
    }
    
    switch (message.role) {
        case 'assistant':
            displayAssistantMessage(message);
            break;
        case 'user':
            displayUserMessage(message.content);
            break;
        case 'system':
            displaySystemMessage(message);
            break;
        default:
            console.warn('Unknown message role:', message.role);
            displaySystemMessage(message);
    }
}

/**
 * Start speaking animation
 */
function startSpeakingAnimation() {
    if (currentAssistantMessageDiv) {
        currentAssistantMessageDiv.classList.add('speaking-animation');
    }
}

/**
 * Stop speaking animation
 */
function stopSpeakingAnimation() {
    if (currentAssistantMessageDiv) {
        currentAssistantMessageDiv.classList.remove('speaking-animation');
        currentAssistantMessageDiv = null;
    }
}

/**
 * Switch to interview view with animation
 */
function showInterviewView() {
    fadeOut(uploadSection, () => {
        uploadSection.style.display = 'none';
        insightsPanel.style.display = 'none';
        interviewSection.style.display = 'block';
        fadeIn(interviewSection);
    });
}

/**
 * Switch to insights view with animation
 */
function showInsightsView() {
    fadeOut(interviewSection, () => {
        uploadSection.style.display = 'none';
        interviewSection.style.display = 'none';
        insightsPanel.style.display = 'block';
        fadeIn(insightsPanel);
    });
}

/**
 * Switch to upload view with animation
 */
function showUploadView() {
    fadeOut([interviewSection, insightsPanel], () => {
        insightsPanel.style.display = 'none';
        interviewSection.style.display = 'none';
        uploadSection.style.display = 'block';
        fadeIn(uploadSection);
    });
}

/**
 * Helper function to fade element out
 * @param {HTMLElement|Array} elements - Element(s) to fade out
 * @param {Function} callback - Function to call when fade is complete
 */
function fadeOut(elements, callback) {
    if (!Array.isArray(elements)) {
        elements = [elements];
    }
    
    elements.forEach(el => {
        if (el && el.style.display !== 'none') {
            el.style.opacity = '1';
            let opacity = 1;
            const timer = setInterval(() => {
                if (opacity <= 0.1) {
                    clearInterval(timer);
                    if (callback) callback();
                }
                el.style.opacity = opacity;
                opacity -= 0.1;
            }, 30);
        } else if (callback) {
            callback();
        }
    });
}

/**
 * Helper function to fade element in
 * @param {HTMLElement} element - Element to fade in
 */
function fadeIn(element) {
    if (element) {
        element.style.opacity = '0';
        let opacity = 0;
        const timer = setInterval(() => {
            if (opacity >= 1) {
                clearInterval(timer);
            }
            element.style.opacity = opacity;
            opacity += 0.1;
        }, 30);
    }
}

/**
 * Clear chat container
 */
function clearChat() {
    chatContainer.innerHTML = '';
}

// Export public API
export {
    clearChat, displayAssistantMessage, displayMessage, displaySystemMessage, displayUserMessage,
    displayUserPlaceholder, displayUserTranscription, fadeIn, fadeOut, hideLoading, initUI,
    showError, showInsightsView, showInterviewView, showLoading, showSuccess, showUploadView,
    startSpeakingAnimation, stopSpeakingAnimation
};

