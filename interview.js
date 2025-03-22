/**
 * Interview module handling the interview flow and WebSocket communication
 */
import { getRecordedAudioBase64, playAudio, startRecording, stopCurrentAudio, stopRecording } from './audio.js';
import { getTranscription, resetTranscription, startRecognition, stopRecognition } from './speech.js';
import {
    displayMessage,
    displayUserPlaceholder,
    hideLoading,
    showError,
    showInterviewView,
    showLoading
} from './ui.js';

// WebSocket and interview globals
let websocket = null;
let interviewId = null;
let textResponseInput, sendTextBtn, viewInsightsBtn;
let isProcessingResponse = false; // Flag to prevent duplicate submissions
let isRecording = false;

/**
 * Set up interview functionality
 */
function setupInterview() {
    // Get DOM elements
    textResponseInput = document.getElementById('text-response');
    sendTextBtn = document.getElementById('send-text');
    viewInsightsBtn = document.getElementById('view-insights');
    
    // Set up event listeners
    if (sendTextBtn) {
        sendTextBtn.addEventListener('click', handleTextSubmission);
    }
    
    // Setup recording buttons
    setupRecordingButtons();
    
    // Handle Enter key in text input
    if (textResponseInput) {
        textResponseInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTextSubmission();
            }
        });
    }
}

/**
 * Start a new interview with given ID
 * @param {string} id - Interview ID
 */
async function startNewInterview(id) {
    // Save interview ID globally for access across pages
    interviewId = id;
    window.interviewId = id;
    
    // Show interview UI
    showInterviewView();
    
    // Connect to WebSocket for this interview
    await connectWebSocket();
    
    // Hide insights button at start
    if (viewInsightsBtn) {
        viewInsightsBtn.style.display = 'none';
    }
    
    console.log("Interview started with ID:", id);
}

/**
 * Connect to interview WebSocket
 */
async function connectWebSocket() {
    return new Promise((resolve, reject) => {
        if (!interviewId) {
            showError('No interview ID provided');
            reject('No interview ID provided');
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/interview/${interviewId}`;
        
        console.log("Connecting to WebSocket:", wsUrl);
        
        // Close existing connection if any
        if (websocket && websocket.readyState !== WebSocket.CLOSED) {
            websocket.close();
        }
        
        websocket = new WebSocket(wsUrl);
        
        websocket.onopen = () => {
            console.log('WebSocket connection established');
            resolve();
        };
        
        websocket.onmessage = handleWebSocketMessage;
        
        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            showError('Connection error. Please reload the page.');
            reject(error);
        };
        
        websocket.onclose = (event) => {
            console.log('WebSocket connection closed', event.code, event.reason);
            if (event.code !== 1000) {
                showError(`Connection closed: ${event.reason || 'Unknown reason'}`);
                reject(event);
            }
        };
    });
}

/**
 * Handle WebSocket message event
 * @param {MessageEvent} event - WebSocket message event
 */
function handleWebSocketMessage(event) {
    try {
        const message = JSON.parse(event.data);
        console.log("WebSocket message received:", message);
        
        // Check for the role field which should be present in all messages
        if (!message.role) {
            console.warn("Message missing role field:", message);
            message.role = "system"; // Default to system if missing
        }
        
        // Handle assistant messages (questions or responses)
        if (message.role === "assistant") {
            // Display assistant message
            displayMessage({
                role: "assistant",
                content: message.content
            });
            
            // Play audio if available - remove isQuestion check to play all audio
            if (message.audio) {
                console.log("Playing audio from assistant message");
                playAudio(message.audio);
            } else {
                console.log("No audio data in assistant message");
            }
            
            // Signal processing complete
            isProcessingResponse = false;
            hideLoading();
        } 
        // Handle system messages
        else if (message.role === "system") {
            displayMessage({
                role: "system",
                content: message.content || "System message"
            });
            isProcessingResponse = false;
            hideLoading();
        }
        // Handle any message with content but no specific role handling
        else if (message.content) {
            displayMessage(message);
            isProcessingResponse = false;
            hideLoading();
        }
        
        // Check if interview is complete
        if (message.interviewComplete) {
            viewInsightsBtn.style.display = 'inline-block';
            viewInsightsBtn.onclick = () => {
                window.location.href = `/insights.html?interview=${interviewId}`;
            };
        }
    } catch (error) {
        console.error("Error handling WebSocket message:", error);
        console.error("Raw message data:", event.data);
        hideLoading();
        isProcessingResponse = false;
    }
}

/**
 * Send audio data to server
 */
async function sendAudio() {
    // Prevent duplicate submissions
    if (isProcessingResponse) {
        console.log("Already processing a response, please wait");
        return;
    }
    
    isProcessingResponse = true;
    isRecording = false;
    showLoading();
    
    // Get audio data as base64
    const audioBase64 = await getRecordedAudioBase64();
    
    // Get transcript from speech recognition
    const transcript = getTranscription();
    console.log("Raw transcription:", transcript);
    
    if (!transcript || transcript.trim() === '[ Listening... ]' || transcript.trim() === '') {
        // Show error but don't reset processing state yet
        hideLoading();
        showError("No speech detected. Please try again.");
        isProcessingResponse = false;
        return;
    }
    
    // Remove any existing placeholder message with "Listening..." text
    const placeholderMessages = document.querySelectorAll('.message.user');
    for (const msg of placeholderMessages) {
        if (msg.textContent.includes('[ Listening... ]')) {
            msg.remove();
        }
    }
    
    // Use displayMessage instead of displayUserMessage
    displayMessage({
        role: "user",
        content: transcript
    });
    
    // Get voice style from UI
    const voiceStyle = document.getElementById('voice-style').value;
    
    // Check if the WebSocket is connected
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        // Send as audio with transcription
        const messageData = {
            type: 'audio',
            content: audioBase64 || "", 
            transcription: transcript,
            voiceStyle: voiceStyle
        };
        
        websocket.send(JSON.stringify(messageData));
        
        // Reset transcription
        resetTranscription();
    } else {
        console.error("WebSocket not open", websocket?.readyState);
        hideLoading();
        isProcessingResponse = false;
        showError("Connection lost. Please reload the page to reconnect.");
        
        // Try to reconnect
        await connectWebSocket();
    }
}

/**
 * Handle text submission
 */
function handleTextSubmission() {
    const text = textResponseInput.value.trim();
    if (!text) return;
    
    // Prevent duplicate submissions
    if (isProcessingResponse) {
        console.log("Already processing a response, please wait");
        return;
    }
    
    isProcessingResponse = true;
    
    // Show loading indicator
    showLoading();
    
    // Display user message
    displayUserPlaceholder(text);
    
    // Stop any currently playing audio
    stopCurrentAudio();
    
    // Get selected voice style
    const voiceStyle = document.getElementById('voice-style').value;
    console.log(`Using voice style: ${voiceStyle}`);
    
    // Send to server
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        const messageData = {
            type: 'text',
            content: text,
            voiceStyle: voiceStyle
        };
        
        console.log("Sending text to server:", messageData.content);
        
        websocket.send(JSON.stringify(messageData));
        
        // Clear input
        textResponseInput.value = '';
    } else {
        hideLoading();
        isProcessingResponse = false;
        showError("Connection lost. Please reload the page to reconnect.");
    }
}

/**
 * Close WebSocket connection
 */
function closeConnection() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.close();
    }
}

/**
 * Setup event listeners for recording buttons
 */
function setupRecordingButtons() {
    // Get button references
    const startBtn = document.getElementById('start-recording');
    const stopBtn = document.getElementById('stop-recording');
    
    // Make sure the buttons exist before adding listeners
    if (!startBtn || !stopBtn) {
        console.error("Recording buttons not found in DOM");
        return;
    }
    
    // Remove any existing event listeners to prevent duplicates
    startBtn.replaceWith(startBtn.cloneNode(true));
    stopBtn.replaceWith(stopBtn.cloneNode(true));
    
    // Get the new button references after replacing
    const newStartBtn = document.getElementById('start-recording');
    const newStopBtn = document.getElementById('stop-recording');
    
    // Add click listener for start button
    newStartBtn.addEventListener('click', async () => {
        console.log("Start recording button clicked");
        
        if (isRecording || isProcessingResponse) {
            console.log("Already recording or processing");
            return;
        }
        
        // Make sure previous recording is fully stopped
        await stopRecording();
        stopRecognition();
        
        // Reset flags
        isRecording = true;
        
        // First create a placeholder message
        displayUserPlaceholder('[ Listening... ]');
        
        // Enable the stop button
        newStopBtn.disabled = false;
        newStopBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        
        // Disable the start button
        newStartBtn.disabled = true;
        
        // Set timeout for auto-stopping (safety)
        const recordingTimeout = setTimeout(() => {
            if (isRecording) {
                console.log("Auto-stopping recording after 30 seconds");
                newStopBtn.click();
            }
        }, 30000);
        
        // Start audio recording first
        const recordingStarted = await startRecording();
        console.log("Audio recording started:", recordingStarted);
        
        // Then start speech recognition to capture transcription
        const recognitionStarted = startRecognition();
        console.log("Speech recognition started:", recognitionStarted);
        
        if (!recordingStarted || !recognitionStarted) {
            clearTimeout(recordingTimeout);
            isRecording = false;
            newStartBtn.disabled = false;
            newStopBtn.disabled = true;
            newStopBtn.classList.add('opacity-50', 'cursor-not-allowed');
            showError("Failed to start recording. Please check microphone access and browser permissions.");
        }
    });
    
    // Add click listener for stop button
    newStopBtn.addEventListener('click', () => {
        console.log("Stop recording button clicked");
        
        if (!isRecording) {
            console.log("Not currently recording");
            return;
        }
        
        console.log("Stopping recording and sending audio");
        // Re-enable the start button
        newStartBtn.disabled = false;
        
        // Disable the stop button
        newStopBtn.disabled = true;
        newStopBtn.classList.add('opacity-50', 'cursor-not-allowed');
        
        stopRecognition();
        stopRecording();
        
        // Send audio with small delay to ensure recording is fully stopped
        setTimeout(() => {
            sendAudio();
        }, 100);
    });
}

// Export public API
export {
    closeConnection, connectWebSocket, handleTextSubmission, sendAudio, setupInterview,
    startNewInterview
};

