"""
Gemini AI integration service.
"""
import re
import json
import logging
import google.generativeai as genai

# Configure logging
logger = logging.getLogger(__name__)

async def generate_interview_questions(resume_text, job_description):
    """
    Generate interview questions based on resume and job description
    
    Args:
        resume_text (str): The candidate's resume text
        job_description (str): The job description
        
    Returns:
        list: Generated interview questions
    """
    model = genai.GenerativeModel('gemini-2.0-flash')
    
    prompt = f"""
    You are an expert AI interviewer for job candidates. Based on the following resume and job description:

    JOB DESCRIPTION:
    {job_description}

    RESUME:
    {resume_text}

    Generate 5 specific, thoughtful interview questions that assess the candidate's fit for this role.
    Focus on questions that evaluate skills, experience, and problem-solving abilities relevant to the role.
    Each question should be concise and clear.
    
    Return ONLY the questions in JSON format with the key 'questions' and an array of strings.
    Example: {{"questions": ["Question 1", "Question 2", ...]}}
    """
    
    try:
        response = model.generate_content(prompt)
        response_text = response.text
        
        # Extract questions using multiple parsing strategies
        questions = []
        
        # Strategy 1: Try to parse as JSON
        try:
            # Clean the response text to handle potential formatting issues
            json_text = response_text.strip()
            # If response has markdown code blocks, extract the JSON
            json_match = re.search(r'```(?:json)?\s*({.*?})\s*```', json_text, re.DOTALL)
            if json_match:
                json_text = json_match.group(1)
            
            questions_data = json.loads(json_text)
            if isinstance(questions_data, dict) and "questions" in questions_data:
                questions = questions_data["questions"]
        except (json.JSONDecodeError, ValueError):
            # Strategy 2: Extract questions by identifying lines that look like questions
            if not questions:
                lines = response_text.strip().split('\n')
                potential_questions = []
                
                for line in lines:
                    line = line.strip()
                    # Skip empty lines, JSON artifacts, or markdown markers
                    if not line or line.startswith('{') or line.endswith('}') or line.startswith('```'):
                        continue
                    
                    # Check if line could be a question (ends with ? or numbered/bullet-point format)
                    if line.endswith('?') or re.match(r'^(?:\d+\.|\*|\-)\s+', line):
                        # Remove bullet points or numbering
                        cleaned_line = re.sub(r'^(?:\d+\.|\*|\-)\s+', '', line)
                        potential_questions.append(cleaned_line)
                
                if potential_questions:
                    questions = potential_questions
        
        return questions
    
    except Exception as e:
        logger.error(f"Error generating questions with Gemini: {str(e)}")
        # Return empty list, caller will use fallback questions
        return []

async def rate_response(question, response):
    """
    Rate a candidate's response to an interview question
    
    Args:
        question (str): The interview question
        response (str): The candidate's response
        
    Returns:
        float: Rating between 1-10
    """
    model = genai.GenerativeModel('gemini-2.0-flash')
    
    rating_prompt = f"""
    You are an AI interviewer evaluating a candidate's response.
    
    Question: {question}
    Candidate response: {response}
    
    Rate the candidate's response from 1-10 based on:
    - Relevance to the question
    - Clarity of communication
    - Depth of knowledge shown
    
    Return ONLY a number between 1 and 10. No explanation or other text.
    """
    
    try:
        rating_response = model.generate_content(rating_prompt)
        rating_text = rating_response.text.strip()
        
        # Extract numeric rating
        rating_match = re.search(r'\b([1-9]|10)\b', rating_text)
        rating = float(rating_match.group(1)) if rating_match else 5.0
        return rating
    except Exception as e:
        logger.error(f"Error generating rating: {str(e)}")
        return 5.0  # Default rating if generation fails

async def generate_transition(prev_question, next_question):
    """
    Generate a natural transition between interview questions
    
    Args:
        prev_question (str): The previous question
        next_question (str): The next question
        
    Returns:
        str: Transition text
    """
    model = genai.GenerativeModel('gemini-2.0-flash')
    
    transition_prompt = f"""
    You are an AI interviewer. The candidate just answered a question about: "{prev_question}"
    
    The next question will be about: "{next_question}"
    
    Write a very brief (1 sentence) natural transition to introduce the next topic.
    Be professional but conversational. Don't analyze their previous answer.
    IMPORTANT: Do NOT include or repeat the full next question in your transition.
    Just create a bridge phrase like "Let's move on to talk about..." or "Now I'd like to ask about..."
    """
    
    try:
        transition_response = model.generate_content(transition_prompt)
        transition_text = transition_response.text.strip()
        return transition_text
    except Exception as e:
        logger.error(f"Error generating transition: {str(e)}")
        return "Let's move to the next question."  # Better default that won't duplicate

async def generate_interview_summary(job_description, qa_pairs):
    """
    Generate a summary of the interview
    
    Args:
        job_description (str): The job description
        qa_pairs (list): List of question-answer pairs with ratings
        
    Returns:
        str: Generated summary
    """
    model = genai.GenerativeModel('gemini-2.0-flash')
    
    summary_prompt = f"""
    You are an expert HR professional reviewing a job interview.
    
    Job Description:
    {job_description}
    
    Interview Summary:
    {json.dumps(qa_pairs, indent=2)}
    
    Provide a short, actionable assessment of this candidate (150-200 words max).
    Include strengths, areas for improvement, and overall fit for the role.
    """
    
    try:
        summary_response = model.generate_content(summary_prompt)
        summary = summary_response.text
        return summary
    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}")
        return "Summary generation failed. Please review the transcript manually."
