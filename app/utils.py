"""
Utility functions for the application.
"""
import re

def format_question(question_text):
    """
    Clean and standardize question format to ensure conciseness
    
    Args:
        question_text (str): Raw question text
        
    Returns:
        str: Formatted question
    """
    # Remove question numbering (e.g., "1.", "Q1:", etc.)
    cleaned = re.sub(r'^(?:\d+\.|\[?\d+\]?|Q\d+:?|Question\s+\d+:?)\s*', '', question_text.strip())
    
    # Remove quotes if the entire question is quoted
    cleaned = re.sub(r'^"(.*)"$', r'\1', cleaned)
    cleaned = re.sub(r'^\'(.*)\'$', r'\1', cleaned)
    
    # Ensure question ends with question mark if it doesn't already
    if cleaned and not cleaned.endswith('?'):
        if not any(cleaned.endswith(x) for x in ['.', '!', ':']):
            cleaned += '?'
    
    # Capitalize first letter
    if cleaned:
        cleaned = cleaned[0].upper() + cleaned[1:]
    
    return cleaned
