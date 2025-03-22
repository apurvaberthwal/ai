from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import Dict, Any, List, Optional
import json
import logging

# Set up logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# Function to determine if a message is a question
def is_question(text: str) -> bool:
    """Determine if a message is a question based on content."""
    # Simple heuristic: check if the message ends with a question mark
    # or starts with common question words
    question_words = ["what", "how", "why", "can", "could", "would", "tell", "describe", "explain"]
    
    text_lower = text.lower().strip()
    
    if text_lower.endswith("?"):
        return True
        
    for word in question_words:
        if text_lower.startswith(word):
            return True
            
    return False

@router.websocket("/interview/{interview_id}")
async def interview_socket(websocket: WebSocket, interview_id: str):
    """WebSocket endpoint for real-time interview communication."""
    await websocket.accept()
    
    try:
        # Store interview session data
        session_data = {"interview_id": interview_id}
        
        # Send initial greeting
        await websocket.send_json({
            "role": "system",
            "content": f"Interview session {interview_id} started. Waiting for the first question..."
        })
        
        # Main message loop
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            
            try:
                # Parse the incoming message
                client_message = json.loads(data)
                
                # Process the message (this would connect to your interview logic)
                response_message = await process_message(client_message, session_data)
                
                # Mark messages as questions when appropriate
                if response_message.get("role") == "assistant" and is_question(response_message.get("content", "")):
                    response_message["isQuestion"] = True
                
                # Send response back to client
                await websocket.send_json(response_message)
                
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received: {data}")
                await websocket.send_json({
                    "role": "system",
                    "content": "Error: Message format not recognized"
                })
                
    except WebSocketDisconnect:
        logger.info(f"Client disconnected from interview {interview_id}")
    except Exception as e:
        logger.error(f"Error in interview session {interview_id}: {str(e)}")
        await websocket.send_json({
            "role": "system",
            "content": "An error occurred during the interview session."
        })

async def process_message(message: Dict[str, Any], session_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process incoming messages and generate responses.
    This would contain your interview logic, connecting to AI services, etc.
    """
    # This is a placeholder. Replace with your actual message processing logic
    message_type = message.get("type", "unknown")
    
    if message_type == "audio":
        # Handle audio message with transcription
        transcription = message.get("transcription", "")
        # Process the transcription...
        
        # Return a response - in a real app, this would come from your AI service
        return {
            "role": "assistant",
            "content": "This is a placeholder response to your audio input.",
            "audio": None  # Audio would be generated and included here
        }
        
    elif message_type == "text":
        # Handle text message
        content = message.get("content", "")
        # Process the text...
        
        return {
            "role": "assistant",
            "content": "This is a placeholder response to your text input."
        }
        
    else:
        # Handle unknown message type
        return {
            "role": "system",
            "content": f"Unsupported message type: {message_type}"
        }
