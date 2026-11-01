// The 5 hustle templates from the product spec (§13.2): phases with steps, the pipeline board's
// columns and card kind, and the platforms the Launchpad opens. Plain data and functions, tested.
//
// "{skill}" in a step stands for the skill the student names when starting (e.g. "Logo design").
// A step with `skill` needs that skill: the Skill Bridge gives it a "Learn this" button.

export type HustleType = 'freelancing' | 'content' | 'startup' | 'parttime' | 'custom'
export type ItemKind = 'order' | 'content' | 'experiment' | 'session' | 'other'

export interface TemplateStep {
  title: string
  skill?: string
}

export interface TemplatePhase {
  title: string
  steps: TemplateStep[]
}

export interface Platform {
  label: string
  url: string
}

export interface HustleTemplate {
  type: HustleType
  label: string
  description: string
  /** Shown as the goal's placeholder, e.g. "First ₹10,000 by January". */
  goalExample: string
  /** Asked when starting; the answer fills "{skill}". Null = not asked. */
  skillQuestion: string | null
  skillExample: string
  phases: TemplatePhase[]
  /** The kind of card on the pipeline board, and its columns. */
  itemKind: ItemKind
  stages: string[]
  platforms: Platform[]
}

const SKILL = '{skill}'

const LINKEDIN = { label: 'LinkedIn', url: 'https://www.linkedin.com/' }
const WHATSAPP = { label: 'WhatsApp', url: 'https://web.whatsapp.com/' }

export const TEMPLATES: Record<HustleType, HustleTemplate> = {
  freelancing: {
    type: 'freelancing',
    label: 'Freelancing',
    description: 'Sell a skill to clients: design, editing, writing, coding…',
    goalExample: 'First ₹10,000 by January',
    skillQuestion: 'Which skill will you sell?',
    skillExample: 'Logo design',
    phases: [
      {
        title: 'Choose skill and niche',
        steps: [{ title: 'Pick the one skill you will sell' }, { title: 'Pick a niche: who you will work for' }, { title: 'Note what 10 freelancers in that niche charge' }],
      },
      { title: 'Upskill', steps: [{ title: `Learn ${SKILL}`, skill: SKILL }, { title: 'Make one practice project' }] },
      {
        title: 'Portfolio (3 samples)',
        steps: [{ title: 'Make sample 1' }, { title: 'Make sample 2' }, { title: 'Make sample 3' }, { title: 'Put them on one portfolio page' }],
      },
      {
        title: 'Profiles (Upwork, Fiverr, LinkedIn)',
        steps: [{ title: 'Set up your Upwork profile' }, { title: 'Publish a Fiverr gig' }, { title: 'Update your LinkedIn headline' }],
      },
      {
        title: 'Proposals and outreach',
        steps: [{ title: 'Write a short proposal template' }, { title: 'Send 5 proposals a day for a week' }, { title: 'Follow up after 3 days' }],
      },
      {
        title: 'First client and delivery',
        steps: [{ title: 'Agree on scope, price and deadline in writing' }, { title: 'Deliver on time' }, { title: 'Send the invoice' }],
      },
      { title: 'Reviews and testimonials', steps: [{ title: 'Ask the client for a review' }, { title: 'Add the testimonial to your portfolio' }] },
      { title: 'Raise rates and repeat clients', steps: [{ title: 'Raise your price for new clients' }, { title: 'Offer past clients a repeat package' }] },
    ],
    itemKind: 'order',
    stages: ['Proposal', 'Active', 'Delivered', 'Paid'],
    platforms: [{ label: 'Upwork', url: 'https://www.upwork.com/' }, { label: 'Fiverr', url: 'https://www.fiverr.com/' }, LINKEDIN],
  },
  content: {
    type: 'content',
    label: 'Content creation',
    description: 'Grow a channel or page: YouTube, Instagram, a blog…',
    goalExample: '1,000 subscribers by March',
    skillQuestion: null,
    skillExample: '',
    phases: [
      {
        title: 'Niche and audience',
        steps: [{ title: 'Pick your niche' }, { title: 'Describe your viewer in one sentence' }, { title: 'Study 5 creators in your niche' }],
      },
      { title: 'Content pillars', steps: [{ title: 'Choose 3 pillars: topics you will keep coming back to' }] },
      { title: 'Content calendar', steps: [{ title: 'Plan your next 8 posts' }, { title: 'Pick your posting days' }] },
      { title: 'Script', steps: [{ title: 'Learn to write hooks and scripts', skill: 'Scriptwriting' }, { title: 'Script your first video' }] },
      { title: 'Record', steps: [{ title: 'Set up light and sound' }, { title: 'Record your first video' }] },
      { title: 'Edit', steps: [{ title: 'Learn video editing', skill: 'Video editing' }, { title: 'Edit your first video' }] },
      {
        title: 'Publish',
        steps: [{ title: 'Learn to make thumbnails', skill: 'Thumbnail design' }, { title: 'Write the title and description' }, { title: 'Publish on your posting day' }],
      },
      {
        title: 'Analyze and improve',
        steps: [{ title: 'Check views, watch time and comments after 7 days' }, { title: 'Change one thing in the next video' }],
      },
    ],
    itemKind: 'content',
    stages: ['Idea', 'Script', 'Record', 'Edit', 'Published'],
    platforms: [{ label: 'YouTube Studio', url: 'https://studio.youtube.com/' }, { label: 'Instagram', url: 'https://www.instagram.com/' }, LINKEDIN],
  },
  startup: {
    type: 'startup',
    label: 'Startup / business',
    description: 'Solve a problem people would pay for, and test it fast.',
    goalExample: 'First 10 paying users by April',
    skillQuestion: 'What will you build it with?',
    skillExample: 'React',
    phases: [
      { title: 'Problem and idea', steps: [{ title: 'Write the problem in one sentence' }, { title: 'Write who has it and how they solve it today' }] },
      { title: 'Customer interviews (validation)', steps: [{ title: 'Talk to 10 people who have the problem' }, { title: 'Write down what you learned' }] },
      { title: 'Solution and MVP scope', steps: [{ title: 'List the 3 must-have features' }, { title: 'Cut everything else' }] },
      { title: 'Build MVP', steps: [{ title: `Learn ${SKILL}`, skill: SKILL }, { title: 'Build the first version' }] },
      { title: 'First 10 users', steps: [{ title: 'Give it to 10 people from your interviews' }, { title: 'Collect their feedback' }] },
      { title: 'Launch', steps: [{ title: 'Make a simple landing page' }, { title: 'Launch on LinkedIn and in college groups' }] },
      { title: 'First revenue', steps: [{ title: 'Pick a price' }, { title: 'Get your first paying customer' }] },
      {
        title: 'Growth and funding',
        steps: [{ title: "Apply to your college's incubator" }, { title: 'Enter a startup competition' }],
      },
    ],
    itemKind: 'experiment',
    stages: ['To test', 'Running', 'Learned'],
    platforms: [LINKEDIN, WHATSAPP, { label: 'Product Hunt', url: 'https://www.producthunt.com/' }],
  },
  parttime: {
    type: 'parttime',
    label: 'Part-time / tutoring',
    description: 'Teach or work a few hours a week for steady money.',
    goalExample: '₹5,000 a month by December',
    skillQuestion: 'What will you teach or do?',
    skillExample: 'Class 10 maths',
    phases: [
      { title: 'Define the offer', steps: [{ title: 'Pick exactly what you will teach or do, and for whom' }, { title: 'Write what a student gets from you' }] },
      { title: 'Pricing', steps: [{ title: 'Check what others nearby charge' }, { title: 'Set a price per session and a monthly package' }] },
      {
        title: 'Find students or clients',
        steps: [{ title: 'Tell friends and family' }, { title: 'Post in local and college WhatsApp groups' }, { title: 'List yourself on a tutoring site' }],
      },
      { title: 'Schedule sessions', steps: [{ title: 'Pick fixed weekly slots' }, { title: 'Share the schedule with your students' }] },
      { title: 'Deliver', steps: [{ title: `Brush up on ${SKILL}`, skill: SKILL }, { title: "Plan each session's goal" }, { title: "Track each student's progress" }] },
      { title: 'Collect payment and feedback', steps: [{ title: 'Collect fees on time' }, { title: 'Ask students or parents for feedback' }] },
    ],
    itemKind: 'session',
    stages: ['Requested', 'Scheduled', 'Done', 'Paid'],
    platforms: [WHATSAPP, { label: 'Google Meet', url: 'https://meet.google.com/' }, { label: 'UrbanPro', url: 'https://www.urbanpro.com/' }],
  },
  // Used when the AI can't make a plan for the student's own idea (and in Demo Mode).
  custom: {
    type: 'custom',
    label: 'Custom',
    description: 'Your own idea. Describe it and the AI plans the phases.',
    goalExample: 'First ₹2,000 by February',
    skillQuestion: 'Which skill does it need most?',
    skillExample: 'Photography',
    phases: [
      { title: 'Define the goal', steps: [{ title: 'Write what you want to achieve, and by when' }, { title: 'Write why it matters to you' }] },
      { title: 'Learn what you need', steps: [{ title: 'List the skills you need' }, { title: `Learn ${SKILL}`, skill: SKILL }] },
      { title: 'Prepare', steps: [{ title: 'List everything you need to start' }, { title: 'Get the first thing ready' }] },
      { title: 'Start', steps: [{ title: 'Do the first real piece of work' }, { title: 'Show it to someone and ask for feedback' }] },
      { title: 'First results', steps: [{ title: 'Reach your first small result: first rupee, user or post' }] },
      { title: 'Improve and grow', steps: [{ title: 'Each week, write down what worked' }, { title: 'Do more of what worked' }] },
    ],
    itemKind: 'other',
    stages: ['To do', 'Doing', 'Done'],
    platforms: [LINKEDIN, WHATSAPP],
  },
}

/** In the order they are offered. */
export const HUSTLE_TYPES: HustleType[] = ['freelancing', 'content', 'startup', 'parttime', 'custom']

export function toHustleType(value: string): HustleType {
  return (HUSTLE_TYPES as string[]).includes(value) ? (value as HustleType) : 'custom'
}

export interface PlanStep {
  title: string
  /** The skill it needs (Skill Bridge), or null. */
  skillName: string | null
}

export interface PlanPhase {
  title: string
  steps: PlanStep[]
}

/** A template's phases with "{skill}" filled in. Without a skill, the step says "your main skill" and needs no particular one. */
export function planFromTemplate(template: Pick<HustleTemplate, 'phases'>, skill = ''): PlanPhase[] {
  const named = skill.trim()
  return template.phases.map((phase) => ({
    title: phase.title,
    steps: phase.steps.map((step) => ({
      title: step.title.replaceAll(SKILL, named || 'your main skill'),
      skillName: step.skill === undefined ? null : step.skill === SKILL ? named || null : step.skill,
    })),
  }))
}
