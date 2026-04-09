from pydantic import BaseModel

class AgentRunRequest(BaseModel):
    agent_type: str
    file_path: str | None = None

