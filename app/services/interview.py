"""
Interview management service.
"""
import os
import json
import logging
import base64
import asyncio
import datetime
import time  # Add this import
from app.services import get_db, get_collection
from app.services.gemini import (
    generate_interview_questions, 
    rate_response,
    generate_transition,
    generate_interview_summary
)
from app.services.audio import generate_audio
from app.utils import format_question

# Configure logging
logger = logging.getLogger(__name__)

# Fallback questions if API fails
FALLBACK_QUESTIONS = [
    "Tell me about your relevant experience for this role?",
    "What technical skills do you have that match this position?",
    "Describe a challenging project you've worked on and how you handled it?",
    "How do you handle tight deadlines and pressure?",
    "What interests you most about this role and company?"
]

async def create_interview(resume_text, job_description):
    """
    Create a new interview with generated questions
    
    Args:
        resume_text (str): The candidate's resume text
        job_description (str): The job description
        
    Returns:
        dict: Created interview data
    """
    try:
        # Get interviews collection using the helper
        interviews = get_collection('interviews')
        
        # Generate questions
        questions = await generate_interview_questions(resume_text, job_description)
        
        # Format all questions to ensure consistency
        if questions:
            questions = [format_question(q) for q in questions]
            # Remove any empty questions after formatting
            questions = [q for q in questions if q]
        
        # Use fallback questions if needed
        if not questions or len(questions) < 5:
            # Add fallback questions if needed
            while len(questions) < 5:
                fallback_index = len(questions)
                if fallback_index < len(FALLBACK_QUESTIONS):
                    questions.append(FALLBACK_QUESTIONS[fallback_index])
                else:
                    break
        
        # Create interview ID
        interview_id = f"int_{os.urandom(8).hex()}"
        
        # Store in database
        await interviews.insert_one({
            "interview_id": interview_id,
            "questions": questions,
            "history": [],
            "question_index": 0,
            "job_description": job_description,
            "resume_summary": resume_text[:500] + "..." if len(resume_text) > 500 else resume_text,
            "resume_text": resume_text,  # Store full resume text
            "candidate_details": {
                "status": "pending",
                "interview_date": datetime.datetime.now().isoformat(),
                "insights": {}
            },
            "created_at": asyncio.get_running_loop().time()
        })
        
        return {"interview_id": interview_id, "questions": questions}
    except Exception as e:
        logger.error(f"Error creating interview: {str(e)}", exc_info=True)
        raise RuntimeError(f"Failed to create interview: {str(e)}")

async def get_interview_data(interview_id):
    """
    Get interview data by ID
    
    Args:
        interview_id (str): The interview ID
        
    Returns:
        dict: Interview data
    """
    try:
        interviews = get_collection('interviews')
        return await interviews.find_one({"interview_id": interview_id})
    except Exception as e:
        logger.error(f"Error retrieving interview data: {str(e)}", exc_info=True)
        return None

async def process_interview_response(interview_id, message_data=None, role=None, content=None):
    """
    Process an interview response and update the interview
    
    Args:
        interview_id (str): The interview ID
        message_data (dict, optional): Message data from client
        role (str, optional): Message role (used if message_data is None)
        content (str, optional): Message content (used if message_data is None)
        
    Returns:
        dict: Response message to send back to client
    """
    try:
        # Get database collection
        interviews = get_collection('interviews')
        
        # Get interview data
        interview = await get_interview_data(interview_id)
        if not interview:
            logger.error(f"Interview not found: {interview_id}")
            return {"role": "system", "content": "Interview not found"}
        
        questions = interview["questions"]
        question_index = interview["question_index"]
        
        # Process initial assistant message
        if role == "assistant" and content:
            logger.info(f"Processing assistant message: {content[:50]}...")
            # Just update history, no response needed
            await interviews.update_one(
                {"interview_id": interview_id},
                {"$push": {"history": {"role": "assistant", "content": content}}}
            )
            return None
        
        # Process user response
        if message_data:
            # Log the complete message data for debugging
            logger.debug(f"Processing message data: {json.dumps(message_data)}")
            
            user_transcript = None
            
            # Log voice style preference from request
            voice_style = message_data.get("voiceStyle")
            if voice_style:
                logger.info(f"📢 Interview {interview_id}: Voice style requested: '{voice_style}'")
            
            if message_data["type"] == "audio":
                # Process audio response
                if "transcription" in message_data and message_data["transcription"]:
                    user_transcript = message_data["transcription"]
                    logger.info(f"Received audio with transcription: {user_transcript[:50]}...")
                elif message_data.get("content"):
                    # Fall back to audio content if available but no transcription
                    # (This would be for using server-side transcription which we're not doing currently)
                    logger.warning("Audio received without transcription, but has content")
                    user_transcript = "Audio response received (no transcription available)"
                else:
                    logger.error("Audio received with neither transcription nor audio content")
                    return {
                        "role": "system", 
                        "content": "Your audio was received but without any speech content. Please try again and speak clearly."
                    }
                    
            elif message_data["type"] == "text":
                # Process text response
                user_transcript = message_data["content"]
                logger.info(f"Received text response: {user_transcript[:50]}...")
            
            # If we still don't have a transcript, return an error
            if not user_transcript or user_transcript.strip() == "" or user_transcript.strip() == "[ Listening... ]":
                logger.warning(f"Empty or invalid transcript received: '{user_transcript}'")
                return {
                    "role": "system", 
                    "content": "No valid response received. Please try speaking again or use the text input option."
                }
            
            # Rate the response
            if question_index < len(questions):
                try:
                    logger.info(f"Rating response for question: {questions[question_index][:50]}...")
                    rating = await rate_response(questions[question_index], user_transcript)
                    logger.info(f"Response rated: {rating}/10")
                    
                    # Update candidate details with this specific rating
                    # This stores the rating immediately for analytics
                    await interviews.update_one(
                        {"interview_id": interview_id},
                        {"$set": {
                            f"candidate_details.ratings.q{question_index}": rating,
                            "candidate_details.last_question_answered": question_index,
                            "candidate_details.last_update": datetime.datetime.now().isoformat()
                        }}
                    )
                except Exception as e:
                    logger.error(f"Error rating response: {str(e)}")
                    rating = 5.0  # Default if rating fails
            else:
                rating = 5.0  # Default if no question
            
            # Update interview with user response
            await interviews.update_one(
                {"interview_id": interview_id},
                {"$push": {"history": {"role": "user", "content": user_transcript, "rating": rating}}}
            )
            
            # Increment question index
            question_index += 1
            await interviews.update_one(
                {"interview_id": interview_id},
                {"$set": {"question_index": question_index}}
            )
            
            # Check if there are more questions
            if question_index < len(questions):
                # Get next question
                next_question = questions[question_index]
                prev_question = questions[question_index - 1]
                
                # Generate transition
                try:
                    transition_text = await generate_transition(prev_question, next_question)
                    
                    # Check if transition already contains the question (or significant portion)
                    question_already_in_transition = False
                    
                    # Look for question overlap - check if significant parts of the question
                    # (more than 60% of words) already exist in the transition
                    next_question_words = set(next_question.lower().split())
                    transition_words = set(transition_text.lower().split())
                    
                    # Calculate overlap ratio
                    if next_question_words:
                        overlap_count = len(next_question_words.intersection(transition_words))
                        overlap_ratio = overlap_count / len(next_question_words)
                        
                        # If more than 60% of the question words are in the transition
                        if overlap_ratio > 0.6:
                            question_already_in_transition = True
                            logger.info(f"Question already in transition (overlap: {overlap_ratio:.2f})")
                            full_response = transition_text
                        else:
                            # Combine transition and question only if not already included
                            full_response = f"{transition_text} {next_question}" if transition_text else next_question
                    else:
                        full_response = f"{transition_text} {next_question}" if transition_text else next_question
                        
                except Exception as e:
                    logger.error(f"Error generating transition: {str(e)}")
                    transition_text = "Moving to the next question."
                    full_response = f"{transition_text} {next_question}"
                
                # Ensure the question is properly formatted for TTS
                # IMPROVED: Better format the question to make it less "question-like" for TTS
                tts_text = full_response.rstrip()
                if tts_text.endswith('?'):
                    # Add a period after question marks to make it less question-like for the TTS system
                    tts_text = tts_text.replace('?', '?.')
                    logger.info("Added period after question mark to discourage question answering")
                
                # Log the full response being sent
                logger.info(f"Sending next question: {full_response}")
                
                # Update history with assistant response immediately
                await interviews.update_one(
                    {"interview_id": interview_id},
                    {"$push": {"history": {"role": "assistant", "content": full_response}}}
                )
                
                # Store voice style preferences for history
                if voice_style:
                    await interviews.update_one(
                        {"interview_id": interview_id, "question_index": question_index},
                        {"$set": {"voice_used": voice_style}}
                    )
                
                # Start audio generation in a dedicated task to avoid blocking
                audio_task = asyncio.create_task(generate_audio(tts_text, voice_name=voice_style))
                
                # Wait for audio with a timeout
                audio_start_time = time.time()
                try:
                    # IMPROVED: Reduced timeout to catch problematic audio generation earlier
                    audio_bytes = await asyncio.wait_for(audio_task, timeout=7.0)
                    
                    if audio_bytes:
                        audio_size = len(audio_bytes)
                        # Explicitly handle base64 encoding with error handling
                        try:
                            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                            encoded_size = len(audio_base64)
                            logger.info(f"✅ Audio generated successfully: {audio_size} bytes raw, {encoded_size} bytes encoded in {time.time() - audio_start_time:.2f} seconds")
                        except Exception as e:
                            logger.error(f"❌ Error encoding audio to base64: {str(e)}")
                            audio_base64 = ""
                    else:
                        logger.warning("⚠️ Audio generation returned None")
                        audio_base64 = ""
                except asyncio.TimeoutError:
                    logger.warning(f"⚠️ Audio generation timed out after {time.time() - audio_start_time:.2f} seconds")
                    audio_base64 = ""
                except Exception as e:
                    logger.error(f"❌ Error generating audio: {str(e)}", exc_info=True)
                    audio_base64 = ""
                
                # Create the response object
                response = {
                    "role": "assistant",
                    "content": full_response,
                    "audio": audio_base64,
                    "rating": rating
                }
                
                # Log whether audio is included in the response
                if (audio_base64):
                    logger.info(f"🎵 Including audio in response: {len(audio_base64)} bytes")
                else:
                    logger.warning("⚠️ No audio in response, sending text only")
                
                return response
                
            else:
                # End of interview - do NOT generate voice for closing message
                closing_message = "Thank you for completing this interview. Your responses have been recorded."
                
                # No audio generation for closing message - this is intentional
                audio_base64 = ""
                
                # Update history with assistant response
                await interviews.update_one(
                    {"interview_id": interview_id},
                    {"$push": {"history": {"role": "assistant", "content": closing_message, "final": True}}}
                )
                
                # Update candidate details to mark interview as completed
                await interviews.update_one(
                    {"interview_id": interview_id},
                    {"$set": {
                        "candidate_details.status": "completed",
                        "candidate_details.completion_date": datetime.datetime.now().isoformat()
                    }}
                )
                
                # Generate insights asynchronously
                asyncio.create_task(generate_interview_insights(interview_id))
                
                # Return response without audio
                return {
                    "role": "assistant",
                    "content": closing_message,
                    "audio": audio_base64,  # Empty string
                    "rating": rating,
                    "interviewComplete": True
                }
        
        # Default response for invalid request
        return {"role": "system", "content": "Invalid request"}
    except Exception as e:
        logger.error(f"Error processing interview response: {str(e)}", exc_info=True)
        return {"role": "system", "content": f"Error processing response: {str(e)}"}

async def generate_interview_insights(interview_id):
    """
    Generate insights for an interview
    
    Args:
        interview_id (str): The interview ID
        
    Returns:
        dict: Insights data
    """
    # Get database collection
    interviews = get_collection('interviews')
    
    interview = await get_interview_data(interview_id)
    if not interview:
        return None
    
    # Check if summary already exists
    if interview.get("summary"):
        summary = interview["summary"]
    elif len(interview["history"]) >= len(interview["questions"]) * 2:
        # Generate summary if interview is complete
        try:
            # Extract Q&A pairs
            history = interview["history"]
            qa_pairs = []
            
            # Calculate key metrics
            total_rating = 0
            rating_count = 0
            key_strengths = []
            areas_for_improvement = []
            
            for i in range(0, len(history), 2):
                if i+1 < len(history):
                    question = history[i]["content"]
                    answer = history[i+1]["content"]
                    rating = history[i+1].get("rating", None)
                    
                    if rating:
                        total_rating += rating
                        rating_count += 1
                        
                        # Add to strengths or improvements based on rating
                        if rating >= 8:
                            # Extract topic from question
                            topic = question.split("?")[0].strip()
                            if len(topic) > 50:
                                topic = topic[:50] + "..."
                            key_strengths.append(topic)
                        elif rating <= 4:
                            # Extract topic from question
                            topic = question.split("?")[0].strip()
                            if len(topic) > 50:
                                topic = topic[:50] + "..."
                            areas_for_improvement.append(topic)
                    
                    qa_pairs.append({
                        "question": question,
                        "answer": answer,
                        "rating": rating
                    })
            
            # Calculate average rating
            avg_rating = total_rating / rating_count if rating_count > 0 else 0
            
            # Generate summary
            job_description = interview.get("job_description", "Not provided")
            summary = await generate_interview_summary(job_description, qa_pairs)
            
            # Create insights data structure
            insights = {
                "average_rating": avg_rating,
                "questions_answered": rating_count,
                "total_questions": len(interview["questions"]),
                "key_strengths": key_strengths[:3],  # Top 3 strengths
                "areas_for_improvement": areas_for_improvement[:3],  # Top 3 improvement areas
                "completion_date": datetime.datetime.now().isoformat(),
                "status": "completed"
            }
            
            # Store summary and insights in database
            await interviews.update_one(
                {"interview_id": interview_id},
                {"$set": {
                    "summary": summary,
                    "candidate_details.status": "completed",
                    "candidate_details.insights": insights
                }}
            )
        except Exception as e:
            logger.error(f"Error generating summary: {str(e)}")
            summary = "Summary generation failed. Please review the transcript manually."
            
            # Still mark as completed with error
            await interviews.update_one(
                {"interview_id": interview_id},
                {"$set": {
                    "summary": summary,
                    "candidate_details.status": "completed_with_errors",
                }}
            )
    else:
        summary = "Interview not yet completed. Summary will be available when all questions are answered."
        
        # Update status to in_progress
        await interviews.update_one(
            {"interview_id": interview_id},
            {"$set": {"candidate_details.status": "in_progress"}}
        )
    
    # Get the updated interview data
    updated_interview = await get_interview_data(interview_id)
    
    return {
        "transcript": updated_interview["history"], 
        "questions": updated_interview["questions"],
        "summary": summary,
        "candidate_details": updated_interview.get("candidate_details", {})
    }
