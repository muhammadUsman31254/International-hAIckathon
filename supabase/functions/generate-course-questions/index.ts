// @ts-expect-error - Deno runtime import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId, courseName, numQuestions = 10 } = await req.json();
    
    console.log(`Generating ${numQuestions} certification questions for course: ${courseName}`);

    // @ts-expect-error - Deno global
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    // Add variation mechanisms to ensure different questions each time
    const timestamp = Date.now();
    const randomSeed = Math.floor(Math.random() * 1000000);
    const variationId = `${timestamp}-${randomSeed}`;

    const prompt = `Generate ${numQuestions} unique and diverse multiple choice questions for a comprehensive certification test for the course "${courseName}" in climate action and sustainability.

IMPORTANT: Generate completely NEW and DIFFERENT questions each time. Vary the scenarios, contexts, examples, and approaches to ensure uniqueness. Avoid repeating similar question patterns.

Each question should:
- Test comprehensive understanding of the entire course
- Be practical and scenario-based (real-world situations)
- Have 4 answer options
- Include only one correct answer
- Cover different aspects of the course topic
- Be clear and professional
- Use varied scenarios, examples, and contexts to ensure uniqueness

Return ONLY a valid JSON array in this exact format:
[
  {
    "question": "Question text here",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correct_answer": 0
  }
]

The correct_answer should be the index (0-3) of the correct option.
Generation context: ${variationId}`;

    console.log('Calling Groq API to generate questions...');
    console.log('API Key present:', !!groqApiKey);
    
    const requestBody = {
      model: 'llama-3.1-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert educational content creator specializing in climate action and environmental sustainability. Generate high-quality certification exam questions in valid JSON format only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.9,
      top_p: 0.95,
      max_tokens: 3000,
    };
    
    console.log('Request payload (model, messages count):', {
      model: requestBody.model,
      messagesCount: requestBody.messages.length,
      promptLength: prompt.length
    });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Groq API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Groq API response received, choices count:', data.choices?.length || 0);
    
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
      console.error('Invalid Groq API response:', JSON.stringify(data));
      throw new Error('Invalid response from Groq API: missing choices or message');
    }
    
    const generatedText = data.choices[0].message.content;
    console.log('Generated text length:', generatedText?.length || 0);
    console.log('Generated text preview:', generatedText?.substring(0, 200) || 'No content');

    // Parse the JSON from the response
    let questions;
    try {
      const jsonMatch = generatedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                       generatedText.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : generatedText;
      questions = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError);
      throw new Error('Failed to parse generated questions');
    }

    console.log(`Successfully generated ${questions.length} certification questions in runtime`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        questions,
        message: `Generated ${questions.length} certification questions for ${courseName}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-course-questions:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
