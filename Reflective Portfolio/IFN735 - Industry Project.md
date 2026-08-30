## Problem Statement: Hyper-Localized Health Navigation for International Students

**The Industry Challenge**: A significant discrepancy exists between international students' perceived and actual health literacy, with only $17\%$ strongly agreeing they understand the local healthcare system. This disconnect leads to the avoidance of necessary medical treatment due to fear of "out-of-pocket" costs, even when such costs are covered by Overseas Student Health Cover (OSHC).

**Contextual Evidence**: $82\%$ of international students express major concern regarding healthcare affordability, and $29\%$ would prefer to seek treatment in their home country. Current university health services are often under-utilized because students rely on "informal" sources (partners and friends) for health information, particularly regarding sensitive areas like mental and sexual health.

**IT Solution Opportunity**: A "Privacy-First Health Navigator" app that utilizes Generative AI to provide multi-lingual, conversational guidance on OSHC coverage, wait-time predictions for local bulk-billing GPs, and anonymous triage for mental health concerns. The tool would "translate" complex Australian healthcare pathways into culturally familiar contexts for the student's country of origin.

## Resources
https://pmc.ncbi.nlm.nih.gov/articles/PMC11411794/
https://dl.acm.org/doi/epdf/10.1145/3240925.3240969
https://github.com/pisong314/syngp500
https://www.mbsonline.gov.au/
https://www.health.gov.au/sites/default/files/2025-11/overseas-student-health-cover-oshc-fact-sheet.pdf
https://www.health.gov.au/resources/publications/understanding-medicare-provider-handbook
https://alswh.org.au/wp-content/uploads/2020/09/MBS_ALSWH_DataDictionary_2019.pdf
https://www.health.gov.au/sites/default/files/documents/2020/06/overseas-student-health-cover-oshc-explanatory-guidelines-for-consumers-oshc-explanatory-guidelines-for-consumers_0.pdf

![[{C21337F5-20E4-4F2A-AB45-DB8166069B25}.png]]

![[{7E3F86C7-2C7C-4F70-A0D6-6C8F256DC5FD}.png]]
## Pain Points
1. Lack of Knowledge about Australian Healthcare
2. Don't know how much cost is covered by the Insurer

## Important Terms
1. MBS 
2. TGA
3. NHDS
4. HealthDirect
5. Gap between the coverage not coverage

## Scope
Don't want it to suggest medication


## Features
1. Chat where the students can ask about questions related to their health insurance and the Healthcare System of Australia. Students can also ask about specific 
2. Find GP and Specialists around them and filter them on the basis of the type of billing
	- Bulk Billing
	- Private Billing
3. Cost Calculator

## Immediate Tasks
1. Hamid needs to research on the sports problem statement and give updates
2. If Hamid wants to delegate tasks, he may.
3. Read more about Healthcare Standards, MBS, Bulk Billing, Insurance Policies, Difference of Medical Benefits between Medicare, OSHC, OVHC.
4. **Read the Assessment Task 1 and discuss in the next meeting how to solve it**

## TODO: 
1. Shortlist the countries
2. Is (private) insurances from other countries valid in Australia 





---------------- 
This is a comprehensive draft for your **Project Establishment Report**. I have structured it according to your specific requirements, integrating the problem statement, technical needs, and the industry context you provided.

---

# Project Proposal

**Project Title:** MediBridge: A Hyper-Localized AI Health Navigator for International Students

**Team Members:** <Name 1, Name 2, Name 3, Name 4 />

**Project Number:** <Project Number />

**Project Supervisor:** <Tutor Name />

**Final IT Artefact Description:** The final deliverable is a **Privacy-First Health Navigator**, a mobile-responsive web application (PWA) powered by Generative AI. It features a Retrieval-Augmented Generation (RAG) chatbot [[capable ]]of explaining OSHC coverage and Australian healthcare pathways in multiple languages, paired with a geo-spatial search tool to locate local bulk-billing GPs and specialists based on real-time Medicare Benefits Schedule (MBS) data.

---

## 1. Introduction

### 1.1 Industry/Focus Area Brief
The Australian international education sector hosts hundreds of thousands of students annually. A critical barrier to their well-being is "health literacy"—the ability to find, understand, and use information and services to inform health-related decisions. Currently, there is a systemic gap between the Australian healthcare framework (MBS, TGA, and OSHC) and the cultural expectations of international students.

### 1.2 Aim of the Project
The project aims to solve the "affordability fear" and "systemic confusion" among international students. By leveraging Generative AI, MediBridge will provide a culturally familiar interface that translates complex Australian medical billing and insurance protocols into actionable, plain-language guidance, reducing the reliance on "informal" (and often inaccurate) advice from peers.

### 1.3 Objectives
- **Deliver an AI-powered conversational agent** that utilizes RAG to provide 95% accurate responses regarding OSHC coverage based on official Department of Health guidelines.
- **Develop a GP/Specialist Finder** with filtering capabilities for "Bulk Billing" vs. "Private Billing" to minimize out-of-pocket surprises.
- **Interim Artefact (Week 14):** A Minimum Viable Product (MVP) featuring the bilingual AI chat interface (English/Mandarin or Hindi) and a static directory of local GPs.
- **Final Artefact:** A fully integrated system with real-time wait-time predictions, multi-lingual support for 5+ languages, and a verified database of specialists.

### 1.4 Potential Impact
- **For Students:** Increased healthcare utilization and reduced financial stress.
- **For University Partners:** Lowered burden on campus health clinics and improved student retention/satisfaction.
- **For Healthcare Providers:** Reduced administrative overhead by streamlining student understanding of billing before they arrive at the clinic.
---

## 2. Project Management Approach: Agile (SCRUM)

We have selected the **SCRUM framework** for this project.

**Justification:** AI-based projects involve high levels of uncertainty regarding prompt engineering and data accuracy. Scrum’s iterative nature (2-week sprints) allows us to conduct "Sprint Reviews" with our supervisor to validate the AI’s responses and adjust the RAG pipeline before the final deployment.

**Adaptation and Tools:**
- **Sprints:** 4 Sprints across the semester.
- **Roles:** Scrum Master (Team Member 1), Product Owner (Team Member 2), Developers (Team Member 3 & 4).
- **Tracking Tools:** **Trello/Jira** for the Product Backlog and **GitHub** for version control and CI/CD.
- **Controls:** Daily Stand-ups (via Discord) and weekly "Definition of Done" (DoD) checks for AI accuracy.
    
---

## 3. Project Scope and Plan

### 3.1 Scope Definition
- **In-Scope:** OSHC coverage explanation, MBS gap fee calculations, GP/Specialist search, multi-lingual support, and mental health triage (anonymous).
- **Out-of-Scope:** **Medical diagnosis or medication suggestions** (to avoid TGA regulatory issues), booking appointments directly, or storing personal health records (PHR).
- **Scope Risks:** The accuracy of "Wait-time predictions"—this is currently a "clear-as-risk" item as it depends on third-party API availability.

### 3.2 Requirements (User Stories)

| **ID** | **Epic**            | **User Story**                                                                              |
| ------ | ------------------- | ------------------------------------------------------------------------------------------- |
| US.1   | Insurance Navigator | As a student, I want to know if my OSHC covers a blood test so I don't fear the cost.       |
| US.2   | GP Finder           | As a student, I want to filter for "Bulk Billing" GPs near me to avoid out-of-pocket costs. |
| US.3   | Privacy             | As a student, I want to ask about sexual health anonymously so I feel safe.                 |

### 3.3 MVP (Week 14) vs. Final Product
- **Week 14 MVP:** Functional AI Chat (English), Basic GP list for Brisbane/QLD, and OSHC FAQ bot.
- **Final Product:** Full multi-lingual support, wait-time prediction algorithm, and specialist referral guide.    

---

## 4. Technical Solution

### 4.1 Proposed Technology Stack
- **Frontend:** React.js / Tailwind CSS (for mobile-first responsiveness).
- **Backend:** Python (FastAPI) to handle AI logic.
- **AI Engine:** OpenAI GPT-4o or Claude 3.5 API using **RAG (Retrieval-Augmented Generation)**.
- **Database:** Pinecone (Vector Database) to store and query the MBS Data Dictionary and OSHC Fact Sheets.
- **Hosting:** AWS or Vercel.
    
### 4.2 Justification

Using RAG is essential. Standard LLMs may "hallucinate" insurance costs. By feeding the **MBS Online** and **Department of Health OSHC guidelines** into a vector database, we ensure the AI only provides answers grounded in official Australian policy.

---

## 5. Communications and Risks

### 5.1 Communication Plan

|**Stakeholder**|**Method**|**Frequency**|**Purpose**|
|---|---|---|---|
|**Team Members**|Discord / Slack|Daily|Coordination & Tasks|
|**Supervisor**|In-person / Zoom|Weekly|Progress Review & Approval|
|**Industry Partners**|Email/Formal Meet|Fortnightly|Requirement Validation|

### 5.2 Risk Analysis

|**Risk**|**Likelihood**|**Impact**|**Mitigation Strategy**|
|---|---|---|---|
|**AI Hallucinations**|Medium|High|Implement RAG with "Strict Mode" (no answer if not in source).|
|**Timeline Slippage**|High|Medium|Use a 20% buffer in Sprint planning; prioritize MVP features.|
|**Data Privacy**|Low|High|No storage of names/emails; utilize "Session-only" chat tokens.|

---

## 6. Estimated Costs

|**Element**|**Description**|**Estimated Cost (AUD)**|
|---|---|---|
|**Personnel**|4 Junior Devs (Project based - 300 hrs total @ $45/hr)|$13,500 (Notional)|
|**AI API**|OpenAI API Credits (Tokens)|$200|
|**Hosting**|AWS/Vercel (Free Tier + Pro for 3 months)|$150|
|**Contingency**|10% Risk Buffer|$1,385|
|**Total**||**$15,235**|

---

## 7. References (APA Sample)

- Department of Health and Aged Care. (2025). _Overseas Student Health Cover (OSHC) Fact Sheet_. Australian Government.
- Medical Benefits Division. (2024). _Medicare Benefits Schedule (MBS) Data Dictionary_.

---

### **Next Steps**

Would you like me to:
1. **Draft a detailed "Team Contract"** based on these roles and responsibilities?
2. **Generate a set of technical User Stories** and a Sprint 1 Backlog?    
3. **Refine the Technical Solution** section with a specific system architecture diagram description?

-------------


### Problem Statement (Optional): AI-Powered "Inclusion Training" for Event Staff

**The Industry Challenge**: Human interaction is a major point of failure in accessibility. QDN members have identified "increased training for customer service staff" as a critical need to better support people with disabilities during the Games.

**Contextual Evidence**: Accessibility considerations include "customer service support programs" that are currently lacking in depth. Traditional "one-size-fits-all" training videos fail to prepare staff for the nuance of diverse disability needs in high-pressure event scenarios.

**IT Solution Opportunity**: A "Virtual Inclusion Coach" using VR and AI-driven conversational agents. Event staff would undergo "scenario-based immersion" where they interact with virtual visitors who have varying physical, sensory, or cognitive needs. The AI would provide real-time feedback on the staff member's communication style and adherence to Universal Design principles