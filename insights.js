/**
 * Insights module handling the display and management of interview insights
 */
import { closeConnection } from './interview.js';
import { fadeIn, showError, showInsightsView, showUploadView } from './ui.js';

// DOM elements
let insightsPanel, insightsContent, summaryContent, transcriptContainer;
let backToInterviewBtn, downloadInsightsBtn, newInterviewBtn;

/**
 * Set up insights panel functionality
 */
function setupInsightsPanel() {
    // Wait until DOM is fully loaded
    setTimeout(() => {
        try {
            // Initialize DOM elements with error handling
            insightsPanel = document.getElementById('insights-panel');
            insightsContent = document.getElementById('insights-content');
            summaryContent = document.getElementById('summary-content');
            transcriptContainer = document.getElementById('transcript-container');
            
            // These elements might not exist on the insights.html page
            backToInterviewBtn = document.getElementById('back-to-interview');
            downloadInsightsBtn = document.getElementById('download-insights');
            newInterviewBtn = document.getElementById('new-interview');
            
            // Set up event listeners if elements exist
            if (backToInterviewBtn) {
                backToInterviewBtn.addEventListener('click', handleBackToInterview);
            }
            
            if (downloadInsightsBtn) {
                downloadInsightsBtn.addEventListener('click', handleDownloadInsights);
            }
            
            if (newInterviewBtn) {
                newInterviewBtn.addEventListener('click', handleNewInterview);
            }
            
            // Set up insights button if it exists (may not exist on insights.html)
            const viewInsightsBtn = document.getElementById('view-insights');
            if (viewInsightsBtn) {
                viewInsightsBtn.addEventListener('click', () => loadInsights());
            }

            console.log("Insights panel setup complete");
        } catch (error) {
            console.error("Error setting up insights panel:", error);
        }
    }, 100);
}

/**
 * Load interview insights
 * @param {string} interviewId - Optional interview ID (defaults to current one)
 */
async function loadInsights(interviewId) {
    try {
        console.log("Loading insights for:", interviewId);
        
        // Only call showInsightsView if we're not already on the insights page
        if (!window.location.pathname.includes('insights.html')) {
            showInsightsView();
        }
        
        // Ensure DOM elements are available
        if (!insightsContent || !summaryContent || !transcriptContainer) {
            console.error("DOM elements not found for insights");
            // Try to re-initialize the elements
            insightsContent = document.getElementById('insights-content');
            summaryContent = document.getElementById('summary-content');
            transcriptContainer = document.getElementById('transcript-container');
            
            if (!insightsContent || !summaryContent || !transcriptContainer) {
                throw new Error("Required DOM elements for insights not found");
            }
        }
        
        insightsContent.innerHTML = '<div class="loading-spinner" role="status"></div> Loading insights...';
        
        // Use provided ID or get from URL
        const id = interviewId || getCurrentInterviewId();
        
        if (!id) {
            throw new Error('No interview ID provided');
        }
        
        const response = await fetch(`/insights/${id}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch insights: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Insights data received:", data);
        
        // Display summary
        summaryContent.innerHTML = data.summary || 'Summary not available yet.';
        
        // Display questions and transcript
        renderTranscript(data);
        
        // Display candidate details if available
        const candidateDetails = data.candidate_details || {};
        const insights = candidateDetails.insights || {};
        const status = candidateDetails.status || 'pending';
        
        // Calculate metrics
        const questionsAnswered = insights.questions_answered || (data.transcript ? Math.floor(data.transcript.length / 2) : 0);
        const totalQuestions = data.questions.length;
        const completionPercentage = Math.round((questionsAnswered / totalQuestions) * 100);
        const averageRating = insights.average_rating 
            ? insights.average_rating.toFixed(1) 
            : calculateAverageRating(data.transcript);
        
        // Update insights content with candidate details
        insightsContent.innerHTML = `
            <div class="bg-gray-100 p-4 rounded-md">
                <h3 class="font-medium">Interview Summary</h3>
                
                <div class="mt-3 mb-4">
                    <div class="relative pt-1">
                        <div class="flex mb-2 items-center justify-between">
                            <div>
                                <span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                                    Progress
                                </span>
                            </div>
                            <div class="text-right">
                                <span class="text-xs font-semibold inline-block text-blue-600">
                                    ${completionPercentage}%
                                </span>
                            </div>
                        </div>
                        <div class="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                            <div style="width:${completionPercentage}%" class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500"></div>
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div class="bg-white p-3 rounded shadow-sm">
                        <span class="text-gray-600">Questions answered:</span>
                        <span class="font-medium">${questionsAnswered}/${totalQuestions}</span>
                    </div>
                    <div class="bg-white p-3 rounded shadow-sm">
                        <span class="text-gray-600">Average rating:</span>
                        <span class="font-medium">
                            ${typeof averageRating === 'string' ? averageRating : `
                                <span class="flex items-center">
                                    ${averageRating}/10
                                    <span class="ml-2 inline-block w-20 h-3 bg-gray-200 rounded">
                                        <span class="inline-block h-full rounded ${getRatingColorClass(averageRating)}" 
                                              style="width: ${averageRating * 10}%">
                                        </span>
                                    </span>
                                </span>
                            `}
                        </span>
                    </div>
                </div>
                
                ${insights.key_strengths && insights.key_strengths.length > 0 ? `
                <div class="mt-4 bg-white p-3 rounded shadow-sm">
                    <span class="text-gray-600 font-medium">Key Strengths:</span>
                    <ul class="list-disc pl-5 mt-1">
                        ${insights.key_strengths.map(strength => `<li class="text-green-600">${strength}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${insights.areas_for_improvement && insights.areas_for_improvement.length > 0 ? `
                <div class="mt-4 bg-white p-3 rounded shadow-sm">
                    <span class="text-gray-600 font-medium">Areas for Improvement:</span>
                    <ul class="list-disc pl-5 mt-1">
                        ${insights.areas_for_improvement.map(area => `<li class="text-orange-600">${area}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                <div class="mt-4 text-sm text-gray-500 flex items-center">
                    <div class="w-3 h-3 rounded-full ${getStatusColorClass(status)} mr-2"></div>
                    Status: <span class="capitalize ml-1">${status.replace('_', ' ')}</span>
                </div>
            </div>
        `;
        
        // Animate the content in
        fadeIn(insightsContent);
        
    } catch (error) {
        console.error('Insights error:', error);
        showError(`Error loading insights: ${error.message}`);
        if (insightsContent) {
            insightsContent.innerHTML = '<p class="text-red-500">Failed to load insights.</p>';
        }
    }
}

/**
 * Get color class based on rating
 * @param {number} rating - Rating value
 * @returns {string} CSS class
 */
function getRatingColorClass(rating) {
    if (rating >= 8) return 'bg-green-500';
    if (rating >= 6) return 'bg-blue-500';
    if (rating >= 4) return 'bg-yellow-500';
    return 'bg-red-500';
}

/**
 * Get color class based on status
 * @param {string} status - Status value
 * @returns {string} CSS class
 */
function getStatusColorClass(status) {
    switch (status) {
        case 'completed': return 'bg-green-500';
        case 'in_progress': return 'bg-blue-500';
        case 'pending': return 'bg-yellow-500';
        case 'completed_with_errors': return 'bg-orange-500';
        default: return 'bg-gray-500';
    }
}

/**
 * Render the transcript from interview data
 * @param {Object} data - Interview data
 */
function renderTranscript(data) {
    let transcriptHTML = '';
    
    data.questions.forEach((question, index) => {
        transcriptHTML += `
            <div class="question-item mb-4">
                <strong>Q${index + 1}: </strong>${question}
            </div>
        `;
        
        // Find corresponding answer in transcript
        const qIndex = index * 2;
        if (data.transcript && data.transcript[qIndex + 1]) {
            const answer = data.transcript[qIndex + 1];
            const rating = answer.rating || '';
            
            let ratingHTML = '';
            if (rating) {
                const ratingColor = rating >= 8 ? '#4CAF50' : (rating >= 5 ? '#FF9800' : '#F44336');
                const ratingPercentage = rating * 10;
                
                ratingHTML = `
                    <div class="flex items-center">
                        <span style="color:${ratingColor}; font-weight:bold;">Rating: ${rating}/10</span>
                        <div class="ml-2 bg-gray-200 rounded-full h-2.5 w-20">
                            <div class="h-2.5 rounded-full" style="width: ${ratingPercentage}%; background-color: ${ratingColor}"></div>
                        </div>
                    </div>
                `;
            }
            
            transcriptHTML += `
                <div class="ml-8 mb-6 bg-white p-3 rounded-md shadow-sm border-l-4 border-blue-400">
                    <div class="flex justify-between items-start">
                        <strong>Your response:</strong>
                        ${ratingHTML}
                    </div>
                    <p class="mt-2 text-gray-700">${answer.content}</p>
                </div>
            `;
        } else {
            transcriptHTML += `
                <div class="ml-8 mb-6 bg-gray-100 p-3 rounded-md text-gray-500 italic">
                    <p>No response provided</p>
                </div>
            `;
        }
    });
    
    transcriptContainer.innerHTML = transcriptHTML;
    
    // Add animation to transcript items
    const items = transcriptContainer.querySelectorAll('.question-item, .question-item + div');
    items.forEach((item, index) => {
        item.style.animation = `fadeIn 0.3s ease forwards ${index * 0.1}s`;
        item.style.opacity = '0';
    });
}

/**
 * Calculate average rating from transcript
 * @param {Array} transcript - Interview transcript
 * @returns {string} Formatted average rating
 */
function calculateAverageRating(transcript) {
    if (!transcript) return 'N/A';
    
    let totalRating = 0;
    let ratingCount = 0;
    
    transcript.forEach(entry => {
        if (entry.role === 'user' && entry.rating) {
            totalRating += entry.rating;
            ratingCount++;
        }
    });
    
    if (ratingCount === 0) return 'N/A';
    return parseFloat((totalRating / ratingCount).toFixed(1));
}

/**
 * Get current interview ID from URL or global var
 * @returns {string} Interview ID
 */
function getCurrentInterviewId() {
    // Check URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get('interview');
    
    // If not in URL, use the global interview ID
    return urlId || window.interviewId;
}

/**
 * Handle back to interview button click
 */
function handleBackToInterview() {
    insightsPanel.style.display = 'none';
    document.getElementById('interview-section').style.display = 'block';
}

/**
 * Handle download insights button click
 */
function handleDownloadInsights() {
    alert("Report download feature will be available soon!");
}

/**
 * Handle new interview button click
 */
function handleNewInterview() {
    // Reset form
    document.getElementById('upload-form').reset();
    
    // Clear chat
    document.getElementById('chat-container').innerHTML = '';
    
    // Reset sections
    showUploadView();
    
    // Close WebSocket if open
    closeConnection();
    
    // Reset interview ID
    window.interviewId = null;
    
    // Hide view insights button
    document.getElementById('view-insights').style.display = 'none';
}

// Export public API
export {
    loadInsights, setupInsightsPanel
};

