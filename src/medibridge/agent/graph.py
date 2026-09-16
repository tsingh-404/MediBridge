"""ReAct agent graph."""
from __future__ import annotations

from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from medibridge.agent.prompts import system_prompt
from medibridge.agent.state import MediBridgeState
from medibridge.profile import device_from_config
from medibridge.config import CHAT_MODEL, settings
from medibridge.tools.clinic_search import search_clinics
from medibridge.tools.coverage_calculator import calculate_oshc_coverage
from medibridge.tools.mbs_lookup import lookup_mbs_item, search_mbs_items
from medibridge.tools.oshc_rules import query_oshc_rules
from medibridge.tools.waiting_period import check_waiting_period

TOOLS = [
    search_mbs_items,
    lookup_mbs_item,
    calculate_oshc_coverage,
    check_waiting_period,
    query_oshc_rules,
    search_clinics,
]


def build_graph():
    llm = ChatOpenAI(model=CHAT_MODEL, api_key=settings.openai_api_key)
    llm_with_tools = llm.bind_tools(TOOLS, parallel_tool_calls=True)

    def agent_node(state: MediBridgeState, config: RunnableConfig = None) -> dict:
        msgs = state["messages"]
        if not msgs or not isinstance(msgs[0], SystemMessage):
            # Profile context is per-device; ToolNode passes the same config on to
            # the profile-aware tools.
            prompt = system_prompt(device_from_config(config))
            msgs = [SystemMessage(content=prompt)] + list(msgs)
        response = llm_with_tools.invoke(msgs)
        return {"messages": [response]}

    def should_continue(state: MediBridgeState) -> str:
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return END

    graph = StateGraph(MediBridgeState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(TOOLS))
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile()
