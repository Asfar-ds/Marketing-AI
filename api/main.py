"""
AI Marketing Agent - FastAPI Backend
Uses Groq API via LangChain to generate marketing tasks and content.
Includes human feedback loop for content regeneration.
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from langchain_groq import ChatGroq
from langchain.prompts import ChatPromptTemplate
import json
import re

# ── Load environment variables from .env file ──
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="AI Marketing Agent", version="1.0.0")

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve static frontend files ──
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def home():
    return {"message": "FastAPI deployed on Vercel 🚀"}

# ── Pydantic models ──
class BusinessInput(BaseModel):
    num_users: int
    instagram_followers: int
    linkedin_followers: int
    email_responses: int
    long_term_goals: str
    current_state: str


class ContentItem(BaseModel):
    id: Optional[int] = None
    platform: str
    type: Optional[str] = "Post"
    hook: str
    body: str
    hashtags: Optional[List[str]] = []
    cta: Optional[str] = ""


class RegenerateRequest(BaseModel):
    original_content: ContentItem
    feedback: str
    platform: str
    long_term_goals: str
    current_state: str


class MarketingOutput(BaseModel):
    tasks: list
    content: list
    checklist: list
    insights: str


# ── LLM setup ──
def get_llm():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY not found. Please set it in your .env file."
        )
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.7,
        groq_api_key=api_key,
    )


# ── Prompt template ──
MARKETING_PROMPT = """You are an expert AI Marketing Strategist specializing in SaaS and Chrome Extensions. 
The product is "Big Ticket" (ShopBigTicket.com), a Chrome extension that helps users "Buy well" by saving products, comparing details instantly, and tracking prices across the web.

## Business Metrics:
- Number of Users: {num_users}
- Instagram Followers: {instagram_followers}
- LinkedIn Followers/Likes: {linkedin_followers}
- Email Responses: {email_responses}

## Long-Term Goals:
{long_term_goals}

## Current State:
{current_state}

## Instructions:
1. Analyze the metrics and generate a high-impact daily marketing plan for "Big Ticket".
2. Formatting Rules:
   - LinkedIn: Use professional but punchy formatting. Use line breaks (`\\n`) between short paragraphs. Add 1-2 relevant emojis only. Focus on productivity and "shopping smarter".
   - Instagram: Use an engaging, visual tone. Start with a hook. Use emojis and bullet points for readability. Use multiple line breaks (`\\n`) for a clean look.
   - Email: Professional, value-driven newsletter copy with clear calls to action.
3. Content Quality: Avoid generic fluff. Mention specific features of Big Ticket like price tracking, product comparison, or "buying well".

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{{
  "tasks": [
    {{
      "id": 1,
      "title": "Task title here",
      "description": "Specific daily action for Big Ticket team",
      "platform": "Instagram|LinkedIn|Email|General",
      "priority": "High|Medium|Low"
    }}
  ],
  "content": [
    {{
      "id": 1,
      "platform": "Instagram|LinkedIn|Email",
      "type": "Post|Story|Newsletter|Article",
      "hook": "Attention-grabbing headline",
      "body": "Complete formatted copy with line breaks (\\n) and emojis",
      "hashtags": ["relevant", "hashtags"],
      "cta": "Specific call to action"
    }}
  ],
  "checklist": [
    {{
      "id": 1,
      "task": "Checklist item for the day",
      "completed": false
    }}
  ],
  "insights": "Strategic analysis of why this plan works for Big Ticket's current metrics."
}}

Generate at least 4 daily tasks, 3 content pieces, and 5 checklist items.
"""

# ── Regeneration prompt for human feedback ──
REGENERATE_PROMPT = """You are an expert AI Marketing Strategist for "Big Ticket" (Chrome Extension). 
A user reviewed this content and wants improvements.

## Original Content:
- Platform: {platform}
- Hook: {hook}
- Body: {body}

## Feedback:
{feedback}

## Formatting Rules for Regeneration:
- Use clear line breaks (`\\n`) for better readability.
- LinkedIn: Professional, clear, use emojis sparingly.
- Instagram: Engaging, "visual" copywriting, use emojis and bullet points.

Respond ONLY with valid JSON in this exact format:
{{
  "id": {content_id},
  "platform": "{platform}",
  "type": "{content_type}",
  "hook": "New improved hook",
  "body": "New improved body with formatting (\\n)",
  "hashtags": ["updated", "hashtags"],
  "cta": "New CTA"
}}
"""


# ── Routes ──
@app.get("/")
async def serve_frontend():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.post("/api/generate", response_model=None)
async def generate_marketing_plan(data: BusinessInput):
    """Generate AI-powered marketing tasks and content."""
    try:
        llm = get_llm()

        prompt = ChatPromptTemplate.from_template(MARKETING_PROMPT)
        chain = prompt | llm

        result = chain.invoke({
            "num_users": data.num_users,
            "instagram_followers": data.instagram_followers,
            "linkedin_followers": data.linkedin_followers,
            "email_responses": data.email_responses,
            "long_term_goals": data.long_term_goals,
            "current_state": data.current_state,
        })

        # Parse LLM response
        response_text = result.content.strip()

        # Try to extract JSON from the response
        # Sometimes LLMs wrap JSON in markdown code blocks
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', response_text)
        if json_match:
            response_text = json_match.group(1).strip()

        parsed = json.loads(response_text)

        return {
            "success": True,
            "data": parsed,
            "input_metrics": {
                "num_users": data.num_users,
                "instagram_followers": data.instagram_followers,
                "linkedin_followers": data.linkedin_followers,
                "email_responses": data.email_responses,
            }
        }

    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"Failed to parse AI response as JSON: {str(e)}",
            "raw_response": response_text if 'response_text' in dir() else "No response"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/regenerate-content", response_model=None)
async def regenerate_content(data: RegenerateRequest):
    """Regenerate a single content piece based on human feedback."""
    try:
        llm = get_llm()

        prompt = ChatPromptTemplate.from_template(REGENERATE_PROMPT)
        chain = prompt | llm

        hashtags_str = ", ".join(data.original_content.hashtags or [])

        result = chain.invoke({
            "platform": data.original_content.platform,
            "content_type": data.original_content.type or "Post",
            "hook": data.original_content.hook,
            "body": data.original_content.body,
            "hashtags": hashtags_str,
            "cta": data.original_content.cta or "",
            "content_id": data.original_content.id or 1,
            "feedback": data.feedback,
            "long_term_goals": data.long_term_goals,
            "current_state": data.current_state,
        })

        # Parse LLM response
        response_text = result.content.strip()

        # Extract JSON if wrapped in markdown
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', response_text)
        if json_match:
            response_text = json_match.group(1).strip()

        parsed = json.loads(response_text)

        return {
            "success": True,
            "data": parsed,
        }

    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"Failed to parse AI response as JSON: {str(e)}",
            "raw_response": response_text if 'response_text' in dir() else "No response"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    api_key = os.environ.get("GROQ_API_KEY")
    return {
        "status": "healthy",
        "groq_configured": bool(api_key),
    }
