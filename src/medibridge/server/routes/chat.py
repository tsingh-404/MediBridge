from __future__ import annotations

import json
from typing import Annotated, Any, Iterable

from fastapi import APIRouter, Header, Request
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from sse_starlette.sse import EventSourceResponse

from medibridge.server.schemas import ChatRequest

router = APIRouter()

DeviceId = Annotated[str | None, Header(alias="X-MB-Device")]

_MAX_RESULT_PREVIEW = 800  # truncate large tool outputs in the SSE trace


def _msg_from_dict(d: dict):
    role = d.get("role")
    text = d.get("content", "") or ""
    if role == "user":
        return HumanMessage(content=text)
    if role == "assistant":
        return AIMessage(content=text)
    return None


def _truncate(s: str, n: int = _MAX_RESULT_PREVIEW) -> str:
    return s if len(s) <= n else s[:n] + "…"


def _events_for_message(msg: Any) -> Iterable[dict]:
    """Convert a langchain message into one or more SSE events."""
    if isinstance(msg, AIMessage):
        for call in getattr(msg, "tool_calls", None) or []:
            yield {
                "event": "tool_call",
                "data": json.dumps(
                    {"id": call.get("id"), "tool": call.get("name"), "args": call.get("args") or {}}
                ),
            }
        content = msg.content if isinstance(msg.content, str) else ""
        if content.strip() and not (getattr(msg, "tool_calls", None) or []):
            yield {"event": "assistant_message", "data": json.dumps({"text": content})}
    elif isinstance(msg, ToolMessage):
        text = msg.content if isinstance(msg.content, str) else json.dumps(msg.content, default=str)
        yield {
            "event": "tool_result",
            "data": json.dumps(
                {
                    "id": getattr(msg, "tool_call_id", None),
                    "tool": getattr(msg, "name", None),
                    "result_preview": _truncate(text),
                }
            ),
        }


@router.post("/chat")
async def post_chat(req: ChatRequest, request: Request, x_mb_device: DeviceId = None):
    graph = request.app.state.graph
    # Scopes the system prompt and every profile-aware tool to this install.
    config = {"configurable": {"device_id": x_mb_device}}

    history_msgs = []
    if req.history:
        for d in req.history:
            m = _msg_from_dict(d)
            if m is not None:
                history_msgs.append(m)
    history_msgs.append(HumanMessage(content=req.message))

    def sync_iter():
        try:
            for update in graph.stream(
                {"messages": history_msgs}, config=config, stream_mode="updates"
            ):
                # update shape: {node_name: {"messages": [<new messages from that node>]}}
                for _node, payload in update.items():
                    new_msgs = (payload or {}).get("messages") or []
                    for m in new_msgs:
                        for ev in _events_for_message(m):
                            yield ev
            yield {"event": "done", "data": "{}"}
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(sync_iter())
