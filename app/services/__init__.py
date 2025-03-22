"""
Services package initialization.
Initializes all services and provides health check functionality.
"""
import logging
import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

# Configure logging
logger = logging.getLogger(__name__)

# Database connection instance
_db = None
_collections = {}  # Cache for database collections
_gemini_initialized_globally = False

def init_services(db_instance: AsyncIOMotorDatabase, gemini_initialized=False):
    """Initialize all services with dependencies"""
    global _db, _gemini_initialized_globally
    
    if db_instance is None:
        raise ValueError("Database instance cannot be None")
        
    _db = db_instance
    _gemini_initialized_globally = gemini_initialized
    
    # Initialize and validate required collections
    try:
        # Ensure the 'interviews' collection exists by accessing it
        # This will create it if it doesn't exist
        _collections['interviews'] = _db.interviews
        logger.info("Services initialized successfully with database connection")
        
        # Initialize Gemini Live API only if not already initialized
        if not _gemini_initialized_globally:
            from app.services.audio import init_gemini_client
            try:
                logger.info("Initializing Gemini Live API for audio generation")
                gemini_initialized = init_gemini_client()
                if not gemini_initialized:
                    logger.error("Failed to initialize Gemini Live API")
            except Exception as e:
                logger.error(f"Error initializing Gemini Live API: {str(e)}")
        else:
            logger.info("Skipping Gemini Live API initialization (already initialized globally)")
            
    except Exception as e:
        logger.error(f"Failed to initialize collections: {str(e)}")
        raise RuntimeError(f"Database initialization error: {str(e)}")

def get_db():
    """Get the database instance"""
    if _db is None:
        logger.error("Database not initialized. Call init_services first.")
        raise RuntimeError("Database not initialized. Call init_services first.")
    return _db

def get_collection(name):
    """Get a specific database collection with error handling"""
    db = get_db()
    
    # Return from cache if available
    if name in _collections:
        return _collections[name]
        
    # Otherwise get the collection and cache it
    try:
        collection = getattr(db, name)
        _collections[name] = collection
        return collection
    except AttributeError:
        logger.error(f"Collection '{name}' does not exist in the database")
        raise ValueError(f"Collection '{name}' does not exist in the database")

async def check_service_health():
    """Perform health checks on all services"""
    try:
        # Check MongoDB connection
        if _db is None:
            mongo_status = "error: Database not initialized"
        else:
            try:
                await _db.command("ping")
                # Verify collections exist
                colls = await _db.list_collection_names()
                mongo_status = f"connected (collections: {', '.join(colls) or 'none'})"
            except Exception as e:
                mongo_status = f"error: {str(e)}"
    except Exception as e:
        mongo_status = f"error: {str(e)}"
    
    # Check Gemini client
    try:
        from app.services.audio import gemini_available
        if gemini_available:
            tts_status = "connected (Gemini Live API initialized)"
        else:
            tts_status = "error: Gemini Live API not initialized"
    except Exception as e:
        tts_status = f"error: {str(e)}"
    
    return {
        "status": "ok", 
        "timestamp": datetime.datetime.now().isoformat(),
        "mongodb": mongo_status,
        "tts_service": tts_status
    }
