# Additional Resources: Learning More About AI Agent Security

**Tiresias Partner Program -- Sales Engineer Primer**

---

This guide collects external resources for partners who want to deepen their understanding of AI agents, prompt engineering, context engineering, and AI security. Resources are organized by topic with brief descriptions of why each is valuable.

*Note: URLs are current as of early 2026. Verify links before including in client-facing materials, as web addresses can change.*

---

## Agent Frameworks

Understanding the tools customers use to build agents helps you speak their language.

- **LangChain Documentation**
  `https://docs.langchain.com` (verify current URL)
  The most widely adopted agent framework. Understanding LangChain's architecture (chains, agents, tools, memory) gives you vocabulary that maps directly to most enterprise agent deployments.

- **CrewAI Documentation**
  `https://docs.crewai.com` (verify current URL)
  Popular framework for multi-agent systems where specialized agents collaborate on tasks. Useful for understanding delegation patterns and inter-agent communication.

- **Microsoft AutoGen**
  `https://microsoft.github.io/autogen/` (verify current URL)
  Microsoft's framework for building multi-agent conversational systems. Important because many enterprise customers are in the Microsoft ecosystem and will encounter AutoGen through Azure integrations.

- **n8n AI Documentation**
  `https://docs.n8n.io/ai/` (verify current URL)
  Workflow automation platform with AI agent capabilities. Relevant because many organizations start with n8n-style tools before building custom agent systems, and these deployments still need governance.

- **Microsoft Semantic Kernel**
  `https://learn.microsoft.com/en-us/semantic-kernel/` (verify current URL)
  Microsoft's SDK for integrating LLMs into applications with plugin architectures. Common in enterprise .NET environments. Understanding its plugin model helps when discussing API security with SoulGate.

---

## Prompt Engineering

Core knowledge for understanding how agents are instructed and why prompt-level governance matters.

- **Anthropic Prompt Engineering Guide**
  `https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering` (verify current URL)
  Comprehensive, practical guide from the makers of Claude. Covers system prompts, chain-of-thought, structured output, and common pitfalls. One of the best starting points for anyone new to the topic.

- **OpenAI Cookbook**
  `https://cookbook.openai.com` (verify current URL)
  Collection of practical examples for working with OpenAI models. Includes prompt patterns, function calling examples, and optimization techniques. Valuable because many enterprise agents use OpenAI models.

- **Google Prompt Design Guide**
  `https://ai.google.dev/gemini-api/docs/prompting-intro` (verify current URL)
  Google's guide for prompting Gemini models. Useful for understanding how prompt patterns differ across providers, which matters when discussing multi-provider agent deployments.

- **Prompt Engineering Guide (DAIR.AI)**
  `https://www.promptingguide.ai` (verify current URL)
  Community-maintained, provider-agnostic guide covering techniques from basic to advanced. Good reference for understanding the full landscape of prompting methods that agents use.

---

## Context Engineering

Deeper knowledge on how agents manage information, and where governance fits.

- **Simon Willison's Blog**
  `https://simonwillison.net` (verify current URL)
  One of the most prolific and insightful writers on LLM applications, prompt injection, RAG security, and context management. His posts on prompt injection risks are essential reading for anyone selling AI security.

- **Anthropic Context Window and Caching Guide**
  `https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching` (verify current URL)
  Technical guide on managing context effectively with Claude models, including caching strategies. Useful for understanding the cost and performance dimensions of context management.

- **LangChain RAG Documentation**
  `https://python.langchain.com/docs/tutorials/rag/` (verify current URL)
  Practical guide to building retrieval-augmented generation systems. Since RAG is the most common source of dynamic context in agent systems, understanding it helps frame context governance conversations.

- **Pinecone Learning Center**
  `https://www.pinecone.io/learn/` (verify current URL)
  Educational resources on vector databases, embeddings, and semantic search. These are the infrastructure components behind most enterprise context retrieval systems.

---

## AI Security

Critical knowledge for positioning Tiresias in security conversations.

- **OWASP Top 10 for Large Language Model Applications**
  `https://owasp.org/www-project-top-10-for-large-language-model-applications/` (verify current URL)
  The definitive list of LLM security risks, maintained by the same organization behind the web application security Top 10. Covers prompt injection, data leakage, insecure output handling, and more. Essential reference for any AI security conversation.

- **NIST AI Risk Management Framework (AI RMF)**
  `https://www.nist.gov/artificial-intelligence/ai-risk-management-framework` (verify current URL)
  The U.S. government's framework for managing AI risks. Increasingly referenced in enterprise procurement requirements and compliance audits. Understanding it helps when prospects ask about regulatory alignment.

- **MITRE ATLAS (Adversarial Threat Landscape for AI Systems)**
  `https://atlas.mitre.org` (verify current URL)
  A knowledge base of adversarial tactics and techniques against AI systems, modeled after the widely used MITRE ATT&CK framework for cybersecurity. Valuable for mapping agent threats to established security terminology that CISOs already understand.

- **NIST SP 800-218A: Secure Software Development for AI**
  `https://csrc.nist.gov/publications/detail/sp/800-218a/final` (verify current URL)
  NIST guidance on secure development practices specific to AI systems. Relevant for prospects who need to demonstrate compliance with federal standards.

- **Lakera AI Prompt Injection Resources**
  `https://www.lakera.ai/blog` (verify current URL)
  Security company focused on LLM vulnerabilities. Their blog covers real-world prompt injection examples and defenses. Useful for building intuition about the threats Tiresias protects against.

---

## Agent Governance

Resources specifically focused on governing autonomous AI systems.

- **Tiresias Documentation**
  `https://tiresias.network/docs` (verify current URL)
  Our own product documentation. Partners should be familiar with SoulAuth, SoulWatch, and SoulGate capabilities, architecture, and deployment models.

- **EU AI Act Overview**
  `https://artificialintelligenceact.eu` (verify current URL)
  Summary of the European Union's AI regulation. Relevant for any prospect with EU operations or customers. The Act's requirements for high-risk AI systems create direct demand for agent governance.

- **ISO/IEC 42001: AI Management Systems**
  `https://www.iso.org/standard/81230.html` (verify current URL)
  International standard for AI management systems. Early-adopter enterprises are pursuing certification, which requires demonstrable controls over AI systems, including agents.

- **Responsible AI Institute**
  `https://www.responsible.ai` (verify current URL)
  Non-profit focused on responsible AI certification and governance frameworks. Their work informs enterprise AI governance policies and can help frame Tiresias as an implementation tool for responsible AI commitments.

---

## Industry Reports

Market data and strategic analysis for framing sales conversations.

- **Gartner: AI Agents and Autonomous Systems**
  `https://www.gartner.com/en/topics/ai-agents` (verify current URL)
  Gartner's research on AI agent adoption, market sizing, and enterprise readiness. Their predictions and Magic Quadrant positioning influence enterprise purchasing decisions. Useful for establishing market credibility with C-level buyers.

- **McKinsey: The State of Generative AI**
  `https://www.mckinsey.com/capabilities/quantumblack/our-insights` (verify current URL)
  Annual survey on generative AI adoption across industries. Provides concrete statistics on adoption rates, investment levels, and organizational challenges. Good source for data points in sales presentations.

- **a16z: AI Agent Infrastructure**
  `https://a16z.com/ai/` (verify current URL)
  Andreessen Horowitz's analysis of the AI agent infrastructure stack. Their market maps and investment theses help frame where governance fits in the broader ecosystem. Useful for conversations with technical founders and CTOs.

- **Stanford HAI: AI Index Report**
  `https://aiindex.stanford.edu` (verify current URL)
  Annual comprehensive report on AI trends, research, policy, and industry adoption from Stanford's Human-Centered AI Institute. Provides authoritative, well-sourced data that lends credibility to sales conversations.

---

## Communities

Where practitioners discuss agent development, security, and governance in real time.

- **OWASP LLM Security Slack/Discord**
  `https://owasp.org/www-project-top-10-for-large-language-model-applications/` (verify current URL, community links on project page)
  Active community of security professionals focused on LLM and agent security. Good for staying current on emerging threats and connecting with potential champions inside prospect organizations.

- **r/MachineLearning (Reddit)**
  `https://www.reddit.com/r/MachineLearning/` (verify current URL)
  Large, active community discussing ML research and applications. Agent architecture posts and discussions surface here regularly. Useful for understanding how practitioners think about agent design.

- **Hacker News AI Threads**
  `https://news.ycombinator.com` (search for "AI agents", "LLM security", "prompt injection")
  Technical community where AI agent security incidents, new research, and architectural debates surface quickly. Good for staying ahead of trends and understanding developer sentiment.

- **LangChain Discord**
  `https://discord.gg/langchain` (verify current URL)
  Active developer community around the most popular agent framework. Discussions about agent architecture, tool use, and security challenges happen daily. Useful for understanding real-world implementation concerns.

- **MLSecOps Community**
  `https://mlsecops.com` (verify current URL)
  Community focused on the intersection of machine learning and security operations. Directly relevant to Tiresias positioning and a good source for case studies and emerging best practices.

---

*This resource guide is part of the Tiresias Partner Program Sales Toolkit. For Tiresias product documentation, visit tiresias.network.*
