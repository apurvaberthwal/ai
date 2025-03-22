import json
import base64
import logging
import asyncio  # Add this import for asyncio.create_task()
import time  # Add this import
from fastapi import APIRouter, UploadFile, File, Form, WebSocket, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from app.services import get_db, get_collection

from app.services.interview import (
    create_interview, 
    get_interview_data, 
    process_interview_response, 
    generate_interview_insights
)
from app.services.pdf import extract_text_from_pdf
from app.services.audio import generate_audio
from app.utils import format_question

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Serve homepage
@router.get("/", response_class=HTMLResponse)
async def get_homepage():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Frontend HTML file not found")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Encoding error: {str(e)}")

# Serve insights page
@router.get("/insights.html", response_class=HTMLResponse)
async def get_insights_page():
    try:
        with open("static/insights.html", "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Insights HTML file not found")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Encoding error: {str(e)}")

# Upload and parse resume endpoint
@router.post("/upload-resume/")
async def upload_resume(resume: UploadFile = File(...), job_description: str = Form(...)):
    # Validate file extension
    if not resume.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        # Read the PDF content properly
        pdf_content = await resume.read()
        
        if not pdf_content:
            raise HTTPException(status_code=400, detail="Empty PDF file received")
            
        # Extract text from PDF using our service
        resume_text = await extract_text_from_pdf(pdf_content)
        
        if not resume_text or not resume_text.strip():
            raise HTTPException(
                status_code=400, 
                detail="Could not extract text from PDF. Please ensure it's a valid PDF with text content."
            )

        # Create interview and generate questions
        interview_data = await create_interview(resume_text, job_description)
        
        return interview_data
        
    except ValueError as ve:
        # Specific error for PDF parsing issues
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error processing resume: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {str(e)}")

# WebSocket endpoint for interview
@router.websocket("/interview/{interview_id}")
async def interview_websocket(websocket: WebSocket, interview_id: str):
    print(f"\n\n***** WEBSOCKET CONNECTED: {interview_id} *****\n\n")
    await websocket.accept()
    
    try:
        # Initialize the interview session
        interview_data = await get_interview_data(interview_id)
        if not interview_data:
            logger.error(f"Invalid interview ID: {interview_id}")
            await websocket.close(code=1008, reason="Invalid interview ID")
            return

        # Send first question
        question_index = interview_data["question_index"]
        questions = interview_data["questions"]
        
        logger.info(f"Starting interview {interview_id}. Questions: {len(questions)}")
        logger.info(f"Current question index: {question_index}")
        
        if question_index < len(questions):
            current_question = questions[question_index]
            # Default voice for initial greeting
            default_voice = "Callum"
            logger.info(f"⭐ Starting interview {interview_id} with default voice: {default_voice}")
            logger.info(f"⭐ Sending first question: {current_question}")
            
            # Start audio generation - EXPLICITLY set it as a background task
            audio_task = asyncio.create_task(generate_audio(current_question, voice_name=default_voice))
            
            # First, update the interview history immediately
            await process_interview_response(
                interview_id=interview_id,
                role="assistant", 
                content=current_question
            )
            
            # Prepare the response message
            message = {
                "role": "assistant",
                "content": current_question,
                "audio": ""  # Default empty audio
            }
            
            # Wait for audio with a timeout
            audio_start_time = time.time()
            try:
                # IMPROVED: Reduce timeout to fail faster when there are issues
                audio_bytes = await asyncio.wait_for(audio_task, timeout=8.0)
                if audio_bytes:
                    # Explicitly handle the base64 encoding in a try/except block
                    try:
                        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                        audio_size = len(audio_base64)
                        message["audio"] = audio_base64
                        logger.info(f"✅ Successfully generated audio for first question: {audio_size} bytes in {time.time() - audio_start_time:.2f} seconds")
                    except Exception as e:
                        logger.error(f"❌ Error encoding audio to base64: {str(e)}")
                else:
                    logger.warning("⚠️ Audio generation returned None for first question")
            except asyncio.TimeoutError:
                logger.warning(f"⚠️ Audio generation timed out after {time.time() - audio_start_time:.2f} seconds")
            except Exception as e:
                logger.error(f"❌ Error in audio generation for first question: {str(e)}", exc_info=True)
            
            # IMPORTANT: Verify audio data before sending
            if message["audio"]:
                logger.info(f"🎵 Including audio in message: {len(message['audio'])} bytes")
            else:
                logger.warning("⚠️ No audio in message, sending text only")
                
            # Log the full message content
            logger.info(f"📤 Sending message with audio: {'Yes' if message['audio'] else 'No'}")
            
            # Send the message, ensuring it's properly JSON serialized
            response_json = json.dumps(message)
            logger.info(f"📤 Sending question to client: {message['content'][:50]}... (JSON length: {len(response_json)} bytes)")
            await websocket.send_text(response_json)
            
        else:
            logger.warning(f"Interview {interview_id} already completed (question_index={question_index}, questions={len(questions)})")
            await websocket.close(code=1000, reason="Interview already completed")
            return

        # Main interview loop
        while True:
            # Process user responses 
            try:
                data = await websocket.receive_text()
                logger.info(f"Received WebSocket message length: {len(data)}")
                logger.info(f"Received WebSocket message preview: {data[:100]}...")
                
                try:
                    parsed_data = json.loads(data)
                    
                    # Make sure voiceStyle is only used for questions, not responses
                    if parsed_data.get("type") == "text" or parsed_data.get("type") == "audio":
                        # Preserve voice style only for question generation
                        voice_style = parsed_data.get("voiceStyle")
                        logger.info(f"Using voice style '{voice_style}' for next question (not responses)")
                    
                    # Process the user's response and get the next question/response
                    response = await process_interview_response(
                        interview_id=interview_id,
                        message_data=parsed_data
                    )
                    
                    # If we have a response, send it back
                    if response:
                        logger.info(f"Sending response back to client: {response.get('content', '')[:50]}...")
                        await websocket.send_text(json.dumps(response))
                        
                        # If interview is complete, close the connection
                        if response.get("interviewComplete"):
                            await websocket.close(code=1000)
                            break
                    else:
                        logger.warning("No response returned from process_interview_response")
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {str(e)}")
                    await websocket.send_text(json.dumps({
                        "role": "system",
                        "content": "Invalid message format. Please try again."
                    }))
            except Exception as e:
                logger.error(f"Error in WebSocket loop: {str(e)}", exc_info=True)
                try:
                    await websocket.send_text(json.dumps({
                        "role": "system",
                        "content": f"An error occurred: {str(e)}"
                    }))
                except:
                    logger.error("Failed to send error message to client")

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}", exc_info=True)
        try:
            await websocket.close(code=1011, reason=f"Error: {str(e)}")
        except:
            pass

# Insights endpoint
@router.get("/insights/{interview_id}")
async def get_insights(interview_id: str):
    insights = await generate_interview_insights(interview_id)
    if not insights:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    # Log successful insights retrieval
    logger.info(f"Retrieved insights for interview: {interview_id}")
    return insights

# Add a new endpoint to support candidate details update
@router.post("/update-candidate/{interview_id}")
async def update_candidate_details(interview_id: str, details: dict):
    try:
        interviews = get_collection('interviews')
        
        # First check if interview exists
        interview = await get_interview_data(interview_id)
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found")
        
        # Update candidate details
        await interviews.update_one(
            {"interview_id": interview_id},
            {"$set": {"candidate_details": {**interview.get("candidate_details", {}), **details}}}
        )
        
        return {"status": "success", "message": "Candidate details updated"}
    except Exception as e:
        logger.error(f"Error updating candidate details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update candidate details: {str(e)}")

# Health check endpoint
@router.get("/health")
async def health_check():
    from app.services import check_service_health
    return await check_service_health()

# Debug route for logging WebSocket issues
@router.get("/debug-info")
async def debug_info():
    """Debug endpoint to check current system state"""
    from app.services import _collections
    return {
        "collections": list(_collections.keys()),
        "websocket_stats": {
            "active_connections": getattr(interview_websocket, "_active_connections", "N/A"),
        }
    }

def register_routes(app):
    """Register all API routes with the FastAPI app"""
    app.include_router(router)
