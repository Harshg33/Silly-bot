const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // For streaming responses
    if (req.headers.accept === 'text/event-stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const chat = model.startChat({
        history: history || [],
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      const result = await chat.sendMessageStream(message);
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
      
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // For regular responses
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // Use chat history if provided
    const chat = model.startChat({
      history: history || [],
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ response: text });
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    
    // Handle specific API errors
    if (error.message.includes('API_KEY')) {
      return res.status(500).json({ error: 'Invalid or missing API key' });
    }
    
    if (error.message.includes('quota')) {
      return res.status(429).json({ error: 'API quota exceeded. Please try again later.' });
    }
    
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
};