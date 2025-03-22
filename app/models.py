"""
Data models for validation and documentation.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pydantic import SkipValidation

class Question(BaseModel):
    """Model for a question"""
    text: str = Field(..., description="The question text")

class MessageContent(BaseModel):
    """Model for WebSocket message content"""
    type: str = Field(..., description="Message type (audio/text)")
    content: str = Field(..., description="Message content (base64 audio or text)")
    voiceStyle: Optional[str] = Field(None, description="Voice style for response")
    transcription: Optional[str] = Field(None, description="Speech transcription (for audio)")

class HistoryEntry(BaseModel):
    """Model for interview history entry"""
    role: str = Field(..., description="Message role (user/assistant/system)")
    content: str = Field(..., description="Message content")
    rating: Optional[float] = Field(None, description="Rating (for user responses)")
    final: Optional[bool] = Field(None, description="Whether this is the final message")

class InterviewData(BaseModel):
    """Model for interview data"""
    interview_id: str = Field(..., description="Unique interview ID")
    questions: List[str] = Field(..., description="List of interview questions")
    history: List[Dict[str, SkipValidation[Any]]] = Field(default_factory=list, description="Interview history")
    question_index: int = Field(0, description="Current question index")
    job_description: str = Field(..., description="Job description")
    resume_summary: str = Field(..., description="Summary of candidate's resume")
    summary: Optional[str] = Field(None, description="Interview summary")
    created_at: Optional[float] = Field(None, description="Creation timestamp")

class InterviewResponse(BaseModel):
    """Model for interview creation response"""
    interview_id: str = Field(..., description="Unique interview ID")
    questions: List[str] = Field(..., description="List of interview questions")

class InsightsResponse(BaseModel):
    """Model for interview insights response"""
    transcript: List[Dict[str, SkipValidation[Any]]] = Field(..., description="Interview transcript")
    questions: List[str] = Field(..., description="Interview questions")
    summary: str = Field(..., description="Interview summary")
    candidate_details: Optional[Dict[str, SkipValidation[Any]]] = Field(None, description="Candidate details")
