import os
import sys
import logging
import locale
import datetime
import socket
import argparse
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import google.generativeai as genai
import uvicorn

# Import application modules
from app.routes import register_routes
from app.services import init_services

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', encoding='utf-8')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Parse command line arguments
parser = argparse.ArgumentParser(description='AI Voice Interviewer Server')
parser.add_argument('--port', type=int, help='Port to run the server on')
parser.add_argument('--host', type=str, help='Host to bind the server to')
parser.add_argument('--auto-port', action='store_true', help='Automatically find an available port if the specified one is in use')
args = parser.parse_args()

# Gemini API initialization flag
_gemini_initialized = False

def create_app():
    # Initialize FastAPI app
    app = FastAPI(
        title="AI Voice Interviewer", 
        description="An AI-powered platform for conducting voice interviews"
    )
    
    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )
    
    # Mount static files directory
    app.mount("/static", StaticFiles(directory="static"), name="static")
    
    # Initialize services
    mongodb_uri = os.getenv("MONGODB_URI")
    mongodb_db = os.getenv("MONGODB_DB")
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    
    # Validate required environment variables
    if not all([mongodb_uri, mongodb_db, gemini_api_key]):
        raise ValueError("Missing required environment variables")
    
    # Initialize database connection
    db_client = AsyncIOMotorClient(mongodb_uri)
    db = db_client[mongodb_db]
    
    # Configure Gemini API key globally
    global _gemini_initialized
    if not _gemini_initialized:
        genai.configure(api_key=gemini_api_key)
        _gemini_initialized = True
        logger.info("Gemini API configured globally")
    
    # Initialize services with dependencies
    init_services(db_instance=db, gemini_initialized=_gemini_initialized)
    
    # Register API routes
    register_routes(app)
    
    return app

def is_port_in_use(port, host='0.0.0.0'):
    """Check if a port is in use by trying to bind to it"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return False
        except socket.error:
            return True

def find_available_port(start_port=8000, max_attempts=100):
    """Find an available port starting from start_port"""
    port = start_port
    for _ in range(max_attempts):
        if not is_port_in_use(port):
            return port
        port += 1
    raise RuntimeError(f"Could not find an available port after {max_attempts} attempts")

app = create_app()

if __name__ == "__main__":
    # Show current system encoding for debugging
    current_locale = locale.getpreferredencoding()
    print(f"Current system encoding: {current_locale}")
    print(f"Starting AI Voice Interviewer at {datetime.datetime.now().isoformat()}")
    
    # Determine host and port
    host = args.host or os.getenv("HOST", "0.0.0.0")
    port = args.port or int(os.getenv("PORT", "8007"))
    
    # Check if port is in use
    if is_port_in_use(port, host):
        if args.auto_port:
            # Find an available port
            new_port = find_available_port(port)
            logger.warning(f"Port {port} is already in use. Using port {new_port} instead.")
            port = new_port
        else:
            logger.error(f"Port {port} is already in use. Please specify a different port with --port or use --auto-port")
            logger.info("You can also kill the process using that port with: ")
            if os.name == 'nt':  # Windows
                logger.info(f"  netstat -ano | findstr :{port}")
                logger.info("  taskkill /PID <PID> /F")
            else:  # Unix/Linux
                logger.info(f"  lsof -i :{port}")
                logger.info("  kill -9 <PID>")
            sys.exit(1)
    
    # Configure uvicorn with proper error handling and encoding settings
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run(
        "main:app", 
        host=host, 
        port=port, 
        log_level="info"
    )