export default async function handler(req, res) {
  const { message } = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful, informed, and down-to-earth digital concierge for freelance expats living in Istanbul.',
          },
          {
            role: 'user',
            content: message,
          },
        ],
      }),
    });

    const data = await response.json();

    // --- شروع تغییرات ---
    // بررسی می‌کنیم که آیا پاسخ موفقیت‌آمیز است و آرایه choices وجود دارد
    if (response.ok && data && data.choices && data.choices.length > 0 && data.choices[0].message) {
      // اگر همه چیز درست بود، پاسخ را برمی‌گردانیم
      res.status(200).json({ reply: data.choices[0].message.content });
    } else {
      // اگر خطایی وجود داشت یا ساختار پاسخ غیرمنتظره بود، آن را برای دیباگ در لاگ ثبت می‌کنیم
      console.error("OpenAI API returned an error or unexpected response:", data);
      res.status(500).json({ error: "An error occurred while communicating with the AI.", details: data });
    }
    // --- پایان تغییرات ---

  } catch (error) {
    console.error("An exception occurred in the API handler:", error);
    res.status(500).json({ error: "A server-side exception occurred." });
  }
}
