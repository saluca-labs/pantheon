# Prompt Efficiency: Getting More From Less

**Tiresias Partner Program -- Sales Engineer Primer**

---

## Why Prompt Efficiency Matters

Every interaction an AI agent has with a language model costs money, takes time, and affects quality. In a chatbot, you might have a handful of exchanges per user session. In an agent system, a single task can trigger dozens or hundreds of LLM calls as the agent reasons, uses tools, evaluates results, and iterates.

This creates three compounding pressures:

**Cost (tokens equal money).** Language model providers charge by the token, both for input (what you send) and output (what the model generates). An inefficient agent that sends bloated prompts on every call can cost 3-5x more than an optimized one doing the same work.

**Latency (longer prompts equal slower responses).** Models process tokens sequentially. A prompt with 10,000 tokens of unnecessary context takes measurably longer than a focused 2,000-token prompt. In agent workflows where steps chain together, this latency compounds.

**Quality (noise degrades output).** Language models have finite attention. When a prompt is cluttered with redundant instructions, irrelevant context, or poorly structured information, the model is more likely to miss what matters. Cleaner prompts produce better results.

## Token Economics

Understanding the cost structure helps partners frame the efficiency conversation with prospects.

**Approximate costs per million tokens (as of early 2026):**

| Provider | Model Tier | Input Cost | Output Cost |
|---|---|---|---|
| OpenAI | GPT-4 class | $2.50 - $10.00 | $10.00 - $30.00 |
| Anthropic | Claude Sonnet/Opus | $3.00 - $15.00 | $15.00 - $75.00 |
| Google | Gemini Pro/Ultra | $1.25 - $5.00 | $5.00 - $20.00 |
| Open models (hosted) | Llama, Mixtral | $0.20 - $1.00 | $0.50 - $2.00 |

*Note: Pricing changes frequently. Use these as directional reference points, not quotable figures.*

**How costs scale with agents:** A single customer service agent handling 1,000 tickets per day, with an average of 5 LLM calls per ticket at 4,000 tokens per call, consumes 20 million tokens daily. At $5 per million input tokens and $15 per million output tokens, that is $100-$300 per day for one agent. Organizations running dozens of agents across multiple departments can see monthly LLM costs in the tens or hundreds of thousands of dollars.

Even a 20% improvement in prompt efficiency translates to meaningful savings at that scale.

## Prompt Engineering Fundamentals

These are the building blocks that every agent system relies on.

**System prompts** define the agent's role, capabilities, constraints, and personality. They are sent with every LLM call and form the foundation of the agent's behavior. A well-crafted system prompt is the single highest-leverage investment in agent quality.

**Few-shot examples** show the model what good output looks like by including sample input-output pairs in the prompt. Two or three well-chosen examples often outperform paragraphs of instruction.

**Chain-of-thought prompting** asks the model to reason step by step before giving a final answer. This significantly improves accuracy on complex tasks but increases output token usage. The tradeoff is usually worth it for decision-making steps.

**Structured output** instructs the model to respond in a specific format (JSON, XML, markdown tables). This makes agent systems more reliable because downstream code can parse the output predictably, reducing error-handling complexity and retry costs.

## Efficiency Techniques

These are the practical methods that reduce cost and latency without sacrificing quality.

**Prompt compression.** Remove redundant phrasing, consolidate overlapping instructions, and eliminate filler language. A system prompt that says "You are a helpful assistant that helps users with their questions and provides accurate, detailed answers to whatever they ask" can be replaced with "Answer user questions accurately and in detail." Same effect, fewer tokens.

**Caching.** When multiple agent calls use the same system prompt or context prefix, providers like Anthropic offer prompt caching that dramatically reduces both cost and latency for the repeated portion. This is especially impactful for agents that make many calls with the same base instructions.

**Template reuse.** Define prompt templates with variable slots rather than constructing prompts from scratch each time. This ensures consistency, makes optimization measurable, and reduces the chance of prompt drift over time.

**Variable injection.** Only include the specific data an agent needs for each step. If the agent is looking up a customer record, inject just that record into the prompt, not the entire customer database schema plus documentation.

**Model routing.** Not every agent step requires the most powerful (and expensive) model. Route simple classification tasks to smaller, faster models and reserve frontier models for complex reasoning. A well-designed agent system might use three or four different model tiers.

## Agent-Specific Prompt Patterns

Agents introduce prompt patterns that standard chatbot applications do not encounter.

**Tool descriptions** tell the model what tools are available, what they do, and what parameters they accept. Bloated tool descriptions are one of the most common sources of wasted tokens in agent systems. A tool description should be precise and minimal: name, purpose, parameters, return format.

**Function calling schemas** define the structured format the model should use to invoke tools. Well-designed schemas reduce parsing errors and retries. Poorly designed schemas lead to malformed calls, wasted tokens on corrections, and degraded user experience.

**Memory management** determines how an agent's accumulated context (conversation history, previous tool results, learned information) is included in prompts. Without active management, this context grows with every interaction until it fills the context window, at which point quality degrades sharply. Effective strategies include summarizing older interactions, retaining only key facts, and using external memory stores that the agent queries on demand.

## Common Mistakes

These patterns appear frequently in enterprise agent deployments and represent immediate optimization opportunities for prospects:

- **Over-prompting:** Including extensive instructions for edge cases that rarely occur, inflating every single call for scenarios that affect less than 1% of interactions.
- **Redundant context:** Sending the same reference documentation in every call even when the current step does not need it.
- **Unstructured instructions:** Writing prompts as prose paragraphs instead of clear, scannable bullet points or numbered steps. Models parse structured instructions more reliably.
- **No measurement:** Operating without tracking token usage, cost per task, or quality metrics. You cannot optimize what you do not measure.
- **One-size-fits-all models:** Using the most expensive model for every call, including simple formatting, classification, or routing decisions that a smaller model handles equally well.

## How This Connects to Tiresias

Prompt efficiency is not just a cost optimization concern; it is a security and governance concern.

**SoulGate** inspects and can optimize the API calls that agents make to LLM providers. It provides visibility into what prompts contain, flags calls that include sensitive data unnecessarily, and enforces policies on payload size and content.

**SoulWatch** monitors token usage and cost patterns across all agents in an organization. It detects anomalies (an agent suddenly consuming 10x its normal tokens might indicate a prompt injection attack or a runaway loop), tracks cost trends, and provides the data teams need to identify optimization opportunities.

Together, they give organizations both the visibility and the controls to manage prompt efficiency as a first-class operational concern, not an afterthought.

---

*This primer is part of the Tiresias Partner Program Sales Toolkit. For product documentation, visit tiresias.network.*
