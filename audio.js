import { showError } from './ui.js';

// Audio capture elements
let mediaRecorder = null;
let audioChunks = [];

// DOM elements will be initialized in setup
let volumeControl, volumeValue, recordingIndicator;
let startRecordingBtn, stopRecordingBtn;
let audioPlayer = null;

/**
 * Set up audio recording and playback functionality
 */
function setupAudioHandling() {
    // Initialize DOM elements
    volumeControl = document.getElementById('volume-control');
    volumeValue = document.getElementById('volume-value');
    recordingIndicator = document.getElementById('recording-indicator');
    startRecordingBtn = document.getElementById('start-recording');
    stopRecordingBtn = document.getElementById('stop-recording');
    
    // Create audio player element if it doesn't exist
    if (!audioPlayer) {
        audioPlayer = new Audio();
        audioPlayer.autoplay = false;
        
        // Add to DOM but keep hidden
        audioPlayer.style.display = 'none';
        document.body.appendChild(audioPlayer);
    }
    
    // Set up event listeners
    volumeControl.addEventListener('input', handleVolumeChange);
}

/**
 * Handle volume slider changes
 */
function handleVolumeChange() {
    const volume = parseFloat(volumeControl.value);
    volumeValue.textContent = `${Math.round(volume * 100)}%`;
    
    // Update audio player volume if it exists
    if (audioPlayer) {
        audioPlayer.volume = volume;
    }
}

/**
 * Start audio recording
 * @returns {Promise<boolean>} Success status
 */
async function startRecording() {
    console.log("Starting audio recording");
    
    try {
        // Always stop any existing recording first
        await stopRecording();
        
        // Reset chunks array
        audioChunks = [];
        
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        // Create new MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        
        // Set up data handler
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        // Handle recording stop
        mediaRecorder.onstop = () => {
            // Clean up
            stream.getTracks().forEach(track => track.stop());
            
            if (recordingIndicator) {
                recordingIndicator.style.display = 'none';
            }
        };
        
        // Start recording
        mediaRecorder.start();
        console.log("MediaRecorder started in state:", mediaRecorder.state);
        
        // Show recording indicator
        if (recordingIndicator) {
            recordingIndicator.style.display = 'block';
        }
        
        return true;
    } catch (error) {
        console.error('Recording error:', error);
        showError('Error accessing microphone. Please ensure microphone access is enabled in your browser settings and try again.');
        return false;
    }
}

/**
 * Stop audio recording
 */
function stopRecording() {
    console.log("Stopping audio recording");
    
    return new Promise((resolve) => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.log("Stopping active media recorder");
            
            // Add event listener for when recording actually stops
            mediaRecorder.addEventListener('stop', () => {
                console.log("MediaRecorder stopped");
                resolve();
            }, { once: true });
            
            mediaRecorder.stop();
        } else {
            console.log("No active media recorder to stop");
            resolve();
        }
        
        // Hide recording indicator
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
    });
}

/**
 * Play audio from base64 string using HTML5 Audio
 * @param {string} audioBase64 - Base64 encoded audio data
 */
function playAudio(audioBase64) {
    if (!audioBase64) {
        console.warn("No audio data provided to playAudio");
        return;
    }
    
    console.log("Received audio data length:", audioBase64.length);
    
    try {
        // Make sure we have valid base64 data (it should be a non-empty string)
        if (typeof audioBase64 !== 'string' || audioBase64.trim() === '') {
            console.error("Invalid audio data format:", typeof audioBase64);
            return;
        }
        
        // Some base64 strings might start with // or have other prefixes, clean them up
        let cleanBase64 = audioBase64;
        if (audioBase64.startsWith('//')) {
            cleanBase64 = audioBase64.substring(2);
        }
        
        // Try multiple formats if the first one fails
        const formats = [
            { mime: 'audio/mp3', ext: 'mp3' },
            { mime: 'audio/mpeg', ext: 'mp3' },
            { mime: 'audio/wav', ext: 'wav' },
            { mime: 'audio/x-wav', ext: 'wav' },
            { mime: 'audio/webm', ext: 'webm' }
        ];
        
        let audioBlob = null;
        
        // Convert base64 to binary
        const binaryString = atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Create blobs for different formats and try each one
        for (const format of formats) {
            audioBlob = new Blob([bytes], { type: format.mime });
            const audioURL = URL.createObjectURL(audioBlob);
            
            // Use existing audio player or create new one
            if (!audioPlayer) {
                audioPlayer = new Audio();
                audioPlayer.autoplay = false;
                
                // Add to DOM but keep hidden
                audioPlayer.style.display = 'none';
                document.body.appendChild(audioPlayer);
            }
            
            // Set volume from control if available
            if (volumeControl) {
                audioPlayer.volume = parseFloat(volumeControl.value);
            }
            
            // Add event listeners for debugging
            audioPlayer.onplay = () => console.log("Audio playback started");
            audioPlayer.onended = () => {
                console.log("Audio playback completed");
                stopSpeakingAnimation();
                URL.revokeObjectURL(audioPlayer.src); // Clean up object URL
            };
            audioPlayer.onerror = (e) => {
                console.error("Audio playback error:", e);
                if (format === formats[formats.length - 1]) {
                    // Last format tried, stop animation and log detailed error
                    stopSpeakingAnimation();
                    console.error("All audio formats failed to play");
                }
                URL.revokeObjectURL(audioPlayer.src); // Clean up object URL even on error
            };
            
            // Load and play the audio
            audioPlayer.src = audioURL;
            console.log(`Trying audio format: ${format.mime}`);
            const playPromise = audioPlayer.play();
            
            // Start speaking animation
            startSpeakingAnimation();
            
            // Handle promise rejection (happens in some browsers)
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error(`Audio play() failed with ${format.mime}:`, error);
                    // Continue with next format if this is not the last one
                });
            }
            
            // If the audio plays successfully, we'll hear it
            // If not, the error handler will be called
            break; // Remove this when testing multiple formats
        }
    } catch (error) {
        console.error("Error in audio playback:", error);
        stopSpeakingAnimation();
    }
}

/**
 * Stop currently playing audio
 */
function stopCurrentAudio() {
    if (audioPlayer && !audioPlayer.paused) {
        try {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
        } catch (e) {
            console.warn('Error stopping audio:', e);
        }
    }
}

/**
 * Convert Blob to base64
 * @param {Blob} blob - Audio blob
 * @returns {Promise<string>} Base64 encoded data
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Get recorded audio as base64
 * @returns {Promise<string|null>} Base64 encoded audio or null if no audio
 */
async function getRecordedAudioBase64() {
    if (audioChunks.length === 0) {
        console.warn("No audio chunks to convert to base64");
        return null;
    }
    
    console.log(`Converting ${audioChunks.length} audio chunks to base64`);
    
    try {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        console.log("Created audio blob of size:", audioBlob.size);
        
        return await blobToBase64(audioBlob);
    } catch (error) {
        console.error("Error converting audio to base64:", error);
        return null;
    }
}

// Export public API
export {
    getRecordedAudioBase64, playAudio, setupAudioHandling, startRecording, stopCurrentAudio, stopRecording
};

