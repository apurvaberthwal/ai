"""
PDF processing service.
"""
import logging
from io import BytesIO
from pypdf import PdfReader

# Configure logging
logger = logging.getLogger(__name__)

async def extract_text_from_pdf(pdf_content):
    """
    Extract text from PDF content
    
    Args:
        pdf_content (bytes): Raw PDF file content
        
    Returns:
        str: Extracted text
    """
    if not pdf_content:
        raise ValueError("No PDF content provided")
        
    try:
        # Create BytesIO object from bytes
        pdf_file = BytesIO(pdf_content)
        
        # Initialize PDF reader
        reader = PdfReader(pdf_file)
        
        if len(reader.pages) == 0:
            raise ValueError("PDF file has no pages")
        
        # Extract text from each page
        resume_text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                resume_text += page_text + "\n"
        
        # Check if we got some meaningful text
        if not resume_text.strip():
            logger.warning("PDF parsing resulted in empty text")
            raise ValueError("No text content found in the PDF. The file might be scanned or image-based.")
            
        return resume_text
        
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {str(e)}", exc_info=True)
        if "file has not been decrypted" in str(e).lower():
            raise ValueError("The PDF file is encrypted or password-protected. Please provide an unprotected file.")
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")
