import { setupAudioHandling } from './audio.js';
import { setupInsightsPanel } from './insights.js';
import { setupInterview, startNewInterview } from './interview.js';
import { setupSpeechRecognition } from './speech.js';
import { initUI, showError, showSuccess } from './ui.js';

// Main application initialization
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI components
    initUI();
    
    // Initialize audio handling
    setupAudioHandling();
    
    // Setup form submission
    setupFormSubmission();
    
    // Setup interview functionality
    setupInterview();
    
    // Setup insights panel
    setupInsightsPanel();
});

// Handle resume upload and job description form
function setupFormSubmission() {
    const uploadForm = document.getElementById('upload-form');
    
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const resumeFile = document.getElementById('resume').files[0];
        const jobDescription = document.getElementById('job-description').value.trim();
        
        if (!resumeFile) {
            showError("Please upload a resume (PDF format)");
            return;
        }
        
        if (!jobDescription) {
            showError("Please enter a job description");
            return;
        }
        
        // Show loading state
        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loading-spinner"></div> Processing...';
        submitBtn.disabled = true;
        
        try {
            const formData = new FormData();
            formData.append('resume', resumeFile);
            formData.append('job_description', jobDescription);
            
            const response = await fetch('/upload-resume/', {
                method: 'POST',
                body: formData
            });
            console.log(response)
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to upload resume');
            }
            
            const data = await response.json();
            
            // Start a new interview with the data
            await startNewInterview(data.interview_id);
            
            // Initialize speech recognition after interview starts
            setupSpeechRecognition();
            
            showSuccess("Interview questions generated successfully!");
            
        } catch (error) {
            showError(`Error: ${error.message}`);
            console.error('Upload error:', error);
        } finally {
            // Reset button state
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });
}

// Export public API
export { showError, showSuccess };

