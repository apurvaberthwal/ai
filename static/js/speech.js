/**
 * Speech recognition module
 */
import { displayUserTranscription, showError } from './ui.js';

// Speech recognition globals
let recognition = null;
let interimTranscript = '';
let finalTranscript = '';
let listeningIndicator;
let isRecognizing = false;
let recognitionTimeout;
let recognitionRestartCount = 0;
const MAX_RESTART_ATTEMPTS = 3;

/**
 * Set up speech recognition
 */
function setupSpeechRecognition() {
    // Initialize DOM elements
    listeningIndicator = document.getElementById('listening-indicator');
    
    // Initialize speech recognition if supported
    const result = initSpeechRecognition();
    
    // Log browser information for debugging
    console.log("Browser Speech Recognition Support:", 
        window.SpeechRecognition || window.webkitSpeechRecognition ? "Available" : "Not Available");
    console.log("Browser:", navigator.userAgent);
    
    return result;
}

/**
 * Initialize Web Speech API
 */
function initSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!window.SpeechRecognition) {
        showError('Your browser does not support Speech Recognition. Please use Chrome or try the text input option.');
        return false;
    }
    
    try {
        recognition = new SpeechRecognition();
        recognition.interimResults = true;
        recognition.continuous = true;  // Keep listening for a longer time
        recognition.lang = 'en-US';
        
        // Set up event handlers
        recognition.onstart = handleRecognitionStart;
        recognition.onresult = handleRecognitionResult;
        recognition.onerror = handleRecognitionError;
        recognition.onend = handleRecognitionEnd;
        
        console.log("Speech recognition initialized successfully");
        return true;
    } catch (error) {
        console.error("Error initializing speech recognition:", error);
        showError('Error initializing speech recognition. Please try the text input option.');
        return false;
    }
}

/**
 * Handle recognition start event
 */
function handleRecognitionStart() {
    console.log("Speech recognition started");
    isRecognizing = true;
    recognitionRestartCount = 0;
    finalTranscript = '';
    interimTranscript = '';
    
    if (listeningIndicator) {
        listeningIndicator.style.opacity = 1;
    }
    
    // Safety timeout - if recognition doesn't end naturally after 60s, force it to end
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
    }
    recognitionTimeout = setTimeout(() => {
        if (isRecognizing) {
            console.log("Recognition timeout - forcing stop after 60s");
            stopRecognition();
        }
    }, 60000);
}

/**
 * Handle recognition result event
 * @param {SpeechRecognitionEvent} event - Recognition event
 */
function handleRecognitionResult(event) {
    interimTranscript = '';
    
    // Process results
    for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
        } else {
            interimTranscript += event.results[i][0].transcript;
        }
    }
    
    // Combine final and interim transcripts
    const fullTranscript = finalTranscript + interimTranscript;
    console.log("Transcript updated:", fullTranscript);
    
    // Update UI with current transcription
    displayUserTranscription(fullTranscript || '[ Listening... ]');
}

/**
 * Handle recognition error event
 * @param {SpeechRecognitionErrorEvent} event - Error event
 */
function handleRecognitionError(event) {
    console.error('Speech recognition error:', event.error, event);
    
    if (event.error === 'no-speech') {
        console.log("No speech detected");
        // Don't show error for no-speech as it's common
    } else if (event.error === 'aborted') {
        console.log("Recognition aborted");
    } else if (event.error === 'network') {
        showError("Network error occurred during speech recognition. Please check your connection.", 5000);
    } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showError("Microphone access denied. Please ensure you've given permission to use the microphone.", 5000);
    } else {
        // For other errors, show a message
        showError(`Speech recognition error: ${event.error}. Try using text input instead.`, 5000);
    }
    
    if (listeningIndicator) {
        listeningIndicator.style.opacity = 0;
    }
    isRecognizing = false;
    
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
        recognitionTimeout = null;
    }
}

/**
 * Handle recognition end event
 */
function handleRecognitionEnd() {
    console.log("Speech recognition ended");
    
    // If we still need to be recognizing but it ended unexpectedly, try to restart
    if (isRecognizing && recognitionRestartCount < MAX_RESTART_ATTEMPTS) {
        console.log(`Attempting to restart recognition (attempt ${recognitionRestartCount + 1}/${MAX_RESTART_ATTEMPTS})`);
        recognitionRestartCount++;
        
        try {
            recognition.start();
            console.log("Recognition restarted");
            return;
        } catch (e) {
            console.error("Failed to restart recognition:", e);
        }
    }
    
    // If we reach here, we're done recognizing
    isRecognizing = false;
    
    if (listeningIndicator) {
        listeningIndicator.style.opacity = 0;
    }
    
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
        recognitionTimeout = null;
    }
}

/**
 * Start speech recognition
 */
function startRecognition() {
    console.log("Starting speech recognition");
    
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!window.SpeechRecognition) {
        showError('Your browser does not support Speech Recognition. Please use Chrome or try the text input option.');
        return false;
    }
    
    // First, properly clean up any existing recognition instance
    if (recognition) {
        // Remove all event handlers
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        
        // Stop it if it's running
        if (isRecognizing) {
            try {
                recognition.stop();
            } catch (e) {
                console.warn("Error stopping existing recognition:", e);
            }
        }
    }
    
    // Reset state
    isRecognizing = false;
    recognitionRestartCount = 0;
    finalTranscript = '';
    interimTranscript = '';
    
    // Create new instance
    recognition = new window.SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    // Set up event handlers
    recognition.onstart = handleRecognitionStart;
    recognition.onresult = handleRecognitionResult;
    recognition.onerror = handleRecognitionError;
    recognition.onend = handleRecognitionEnd;
    
    // Start recognition
    recognition.start();
    console.log("Recognition started with fresh instance");
    
    return true;
}

/**
 * Stop speech recognition
 */
function stopRecognition() {
    console.log("Stopping speech recognition");
    
    if (recognition) {
        try {
            // Stop recognition if it's active
            recognition.stop();
            console.log("Recognition stopped");
        } catch (e) {
            console.error('Error stopping speech recognition:', e);
        }
    }
    
    // Always reset the state
    isRecognizing = false;
    
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
        recognitionTimeout = null;
    }
    
    if (listeningIndicator) {
        listeningIndicator.style.opacity = 0;
    }
}

/**
 * Get current transcription
 * @returns {string} Current transcription
 */
function getTranscription() {
    const transcript = finalTranscript + interimTranscript;
    console.log("Getting transcription:", transcript);
    return transcript;
}

/**
 * Reset transcription
 */
function resetTranscription() {
    finalTranscript = '';
    interimTranscript = '';
}

// Export public API
export {
    getTranscription,
    resetTranscription,
    setupSpeechRecognition,
    startRecognition,
    stopRecognition
};

