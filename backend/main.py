from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv
import base64
import json

load_dotenv()

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class SearchRequest(BaseModel):
    query: str

class SearchParams(BaseModel):
    genre: str | None = None
    artist: str | None = None
    era: str | None = None

# Get Spotify token
async def get_spotify_token():
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise Exception("Spotify credentials not found in .env file")
    
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://accounts.spotify.com/api/token",
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data={"grant_type": "client_credentials"}
        )
        
        if response.status_code != 200:
            print(f"Spotify auth error: {response.status_code} - {response.text}")
            raise Exception(f"Spotify authentication failed: {response.text}")
        
        data = response.json()
        if "access_token" not in data:
            raise Exception(f"No access_token in response: {data}")
            
        return data["access_token"]

# Parse query with Deepseek
async def parse_query(query: str) -> SearchParams:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    
    prompt = f"""Extract music search info from: "{query}"

Return JSON with these fields (only if clearly mentioned):
- genre: one genre (pop, rock, hip-hop, jazz, etc)
- artist: artist name
- era: decade (80s, 90s, 2000s, 2010s, 2020s)

Return ONLY valid JSON, nothing else."""

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "You extract music search parameters. Return only JSON."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1
            }
        )
        
        if response.status_code != 200:
            return SearchParams()
        
        content = response.json()["choices"][0]["message"]["content"].strip()
        
        # Clean up response
        if "```" in content:
            content = content.split("```")[1].replace("json", "").strip()
        
        try:
            data = json.loads(content)
            return SearchParams(**data)
        except:
            return SearchParams()

# Search Spotify
async def search_spotify(params: SearchParams, token: str):
    # If no params, return None
    if not params.genre and not params.artist:
        return None
    
    # Build search query
    query_parts = []
    if params.genre:
        query_parts.append(f"genre:{params.genre}")
    if params.artist:
        query_parts.append(f"artist:{params.artist}")
    
    # Add year filter
    if params.era:
        era = params.era.replace("'", "")
        if "80s" in era or "1980" in era:
            query_parts.append("year:1980-1989")
        elif "90s" in era or "1990" in era:
            query_parts.append("year:1990-1999")
        elif "2000s" in era:
            query_parts.append("year:2000-2009")
        elif "2010s" in era:
            query_parts.append("year:2010-2019")
        elif "2020s" in era:
            query_parts.append("year:2020-2029")
    
    search_query = " ".join(query_parts)
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "q": search_query,
                "type": "track",
                "limit": 20
            }
        )
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        return data.get("tracks", {}).get("items", [])

# Main endpoint
@app.post("/api/search")
async def search(request: SearchRequest):
    try:
        print(f"\n🔍 Searching for: {request.query}")
        
        # Parse query
        print("📝 Parsing with Deepseek...")
        params = await parse_query(request.query)
        print(f"✅ Extracted params: {params.dict()}")
        
        # Get Spotify token
        print("🎵 Getting Spotify token...")
        token = await get_spotify_token()
        print("✅ Got Spotify token")
        
        # Search Spotify
        print("🔎 Searching Spotify...")
        tracks = await search_spotify(params, token)
        
        # If no tracks found
        if not tracks:
            print("❌ No tracks found")
            return {
                "error": "Sorry, can't find any tracks",
                "extracted_params": params.dict(),
                "tracks": []
            }
        
        print(f"✅ Found {len(tracks)} tracks")
        return {
            "extracted_params": params.dict(),
            "tracks": tracks
        }
    
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "error": f"Error: {str(e)}",
            "extracted_params": {},
            "tracks": []
        }

@app.get("/api/health")
async def health():
    """Check if environment variables are set"""
    return {
        "status": "ok",
        "spotify_client_id": "✅" if os.getenv("SPOTIFY_CLIENT_ID") else "❌",
        "spotify_client_secret": "✅" if os.getenv("SPOTIFY_CLIENT_SECRET") else "❌",
        "deepseek_api_key": "✅" if os.getenv("DEEPSEEK_API_KEY") else "❌"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)