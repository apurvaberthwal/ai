"""
Fast audio generation service using Gemini Multimodal API.
"""
import io
import os
import asyncio
import base64
import logging
from google import generativeai as genai
from pydub import AudioSegment
from gtts import gTTS

# Configure logging
logger = logging.getLogger(__name__)

# Cache for generated audio
audio_cache = {}

# Initialize Gemini API
def init_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")
    genai.configure(api_key=api_key)
    return True

# Voice mapping
VOICE_MAPPING = {
    "Nova": "en-US-Neural2-F",
    "Orion": "en-US-Neural2-D", 
    "Capella": "en-GB-Neural2-F",
    "Callum": "en-GB-Neural2-D",
    "default": "en-US-Neural2-F"
}

async def generate_audio(text, voice_name=None):
    """Fast audio generation with caching and fallback"""
    if not text:
        return None
        
    # Check cache first
    cache_key = f"{text}:{voice_name or 'default'}"
    if cache_key in audio_cache:
        logger.info("Using cached audio")
        return audio_cache[cache_key]
    
    # Try primary TTS method (gTTS - fast and reliable)
    try:
        audio_data = await generate_audio_gtts(text, voice_name)
        if audio_data:
            # Cache result
            audio_cache[cache_key] = audio_data
            return audio_data
    except Exception as e:
        logger.warning(f"Primary TTS failed: {str(e)}")
    
    # Try fallback with Gemini (slower but may handle more complex text)
    try:
        audio_data = await generate_audio_gemini(text, voice_name)
        if audio_data:
            # Cache result
            audio_cache[cache_key] = audio_data
            return audio_data
    except Exception as e:
        logger.error(f"Fallback TTS failed: {str(e)}")
    
    return None

async def generate_audio_gtts(text, voice_name=None):
    """Generate audio using gTTS (fast method)"""
    
    # Select appropriate language based on voice
    lang = "en"
    if voice_name in ["Capella", "Callum"]:
        lang = "en-gb"
    
    # Run TTS in thread pool to avoid blocking
    return await asyncio.to_thread(_generate_gtts, text, lang)
    
def _generate_gtts(text, lang):
    """Generate TTS using gTTS (non-async helper)"""
    output = io.BytesIO()
    tts = gTTS(text=text, lang=lang, slow=False)
    tts.write_to_fp(output)
    output.seek(0)
    return output.read()

async def generate_audio_gemini(text, voice_name=None):
    """Generate audio using Gemini as fallback"""
    model = genai.GenerativeModel('gemini-1.5-pro')
    
    # Keep prompt simple and direct for speed
    prompt = f"Convert this text to speech: '{text}'. Return just the audio."
    
    response = await asyncio.to_thread(
        model.generate_content, 
        prompt,
        generation_config={"response_mime_type": "audio/mp3"}
    )
    
    if response and hasattr(response, 'parts'):
        for part in response.parts:
            if hasattr(part, 'data') and part.data:
                return part.data
    
    return None

def get_gemini_voice_name(voice_preference=None):
    """Map voice preferences to standard TTS voices"""
    return VOICE_MAPPING.get(voice_preference, VOICE_MAPPING["default"])