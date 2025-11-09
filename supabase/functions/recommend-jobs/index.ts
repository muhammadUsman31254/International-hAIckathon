// @ts-expect-error - Deno runtime import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error - Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, jobs } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    // @ts-expect-error - Deno global
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-expect-error - Deno global
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch user skills
    const { data: userSkills, error: skillsError } = await supabaseClient
      .from('user_skills')
      .select('skill_name')
      .eq('user_id', userId);

    if (skillsError) {
      console.error('Error fetching user skills:', skillsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user skills' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userSkillsList = userSkills?.map(s => s.skill_name.toLowerCase()) || [];
    console.log('User skills:', userSkillsList);

    if (userSkillsList.length === 0) {
      // No skills, return all jobs with match score of 0
      const jobsWithScores = jobs.map((job: any) => ({
        ...job,
        recommendationScore: 0,
        matchedSkills: []
      }));
      
      return new Response(
        JSON.stringify({ jobs: jobsWithScores }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Groq API to rank jobs based on user skills
    // @ts-expect-error - Deno global
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const prompt = `You are a job matching expert specializing in climate action and green economy jobs. Match these jobs with user skills and rank them.

User Skills: ${userSkillsList.join(', ')}

Available Jobs:
${jobs.map((job: any, idx: number) => 
  `${idx}. ${job.title} - Required Skills: ${job.skills?.join(', ') || 'Not specified'} - Difficulty: ${job.difficulty || 'Not specified'} - Type: ${job.type || 'Not specified'}`
).join('\n')}

Analyze skill matches, considering:
- Direct skill matches (highest priority)
- Related/transferable skills
- Job difficulty vs user experience level
- Job type alignment
- Climate action relevance

Return ONLY a JSON array of objects with this exact format:
[
  {"jobIndex": 0, "score": 95, "matchedSkills": ["skill1", "skill2"]},
  {"jobIndex": 1, "score": 85, "matchedSkills": ["skill1"]}
]

Score from 0-100. Sort by score descending. Include all job indices.`;

    console.log('Calling Groq API to recommend jobs...');
    console.log('User skills:', userSkillsList);
    console.log('Jobs count:', jobs.length);

    const requestBody = {
      model: 'llama-3.1-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a job matching expert specializing in climate action and green economy jobs. Analyze job-skill matches and return only valid JSON arrays. Always return a complete ranking for all jobs.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 2000,
    };

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Groq API response status:', aiResponse.status);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Groq API error:', aiResponse.status, errorText);
      throw new Error(`Groq API error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('Groq API response received, choices count:', aiData.choices?.length || 0);
    
    if (!aiData.choices || aiData.choices.length === 0 || !aiData.choices[0].message) {
      console.error('Invalid Groq API response:', JSON.stringify(aiData));
      throw new Error('Invalid response from Groq API: missing choices or message');
    }
    
    const analysisText = aiData.choices[0].message.content.trim();
    console.log('AI Analysis preview:', analysisText.substring(0, 200));

    // Parse the ranking
    let rankings: Array<{jobIndex: number, score: number, matchedSkills: string[]}>;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                       analysisText.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : analysisText;
      rankings = JSON.parse(jsonText);
      
      // Validate rankings structure
      if (!Array.isArray(rankings)) {
        throw new Error('Rankings is not an array');
      }
      
      // Ensure all rankings have required fields
      rankings = rankings.map((r: any) => ({
        jobIndex: r.jobIndex ?? r.index ?? 0,
        score: r.score ?? 0,
        matchedSkills: Array.isArray(r.matchedSkills) ? r.matchedSkills : []
      }));
      
      console.log(`Successfully parsed ${rankings.length} job rankings`);
    } catch (e) {
      console.error('Failed to parse rankings:', e);
      console.error('Analysis text:', analysisText);
      // Fallback: basic matching
      rankings = jobs.map((job: any, idx: number) => {
        const jobSkills = (job.skills || []).map((s: string) => s.toLowerCase());
        const matchedSkills = jobSkills.filter((s: string) => 
          userSkillsList.some(us => s.includes(us) || us.includes(s))
        );
        const score = matchedSkills.length > 0 ? 50 + (matchedSkills.length * 15) : 20;
        return { jobIndex: idx, score, matchedSkills };
      }).sort((a: any, b: any) => b.score - a.score);
      console.log('Using fallback matching algorithm');
    }

    // Attach scores to jobs
    const rankedJobs = rankings.map((ranking) => ({
      ...jobs[ranking.jobIndex],
      recommendationScore: ranking.score,
      matchedSkills: ranking.matchedSkills
    })).filter(job => job.id !== undefined);

    // Add any missing jobs at the end with low scores
    const includedIndices = new Set(rankings.map(r => r.jobIndex));
    const remainingJobs = jobs
      .map((job: any, idx: number) => ({ job, idx }))
      .filter(({ idx }: { idx: number }) => !includedIndices.has(idx))
      .map(({ job }: { job: any }) => ({
        ...job,
        recommendationScore: 10,
        matchedSkills: []
      }));

    const finalJobs = [...rankedJobs, ...remainingJobs];

    return new Response(
      JSON.stringify({ jobs: finalJobs }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in recommend-jobs:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
