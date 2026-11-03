export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, title, datesCount, selectedDate, note } = req.body;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'SPH Bookings <onboarding@resend.dev>',
        to: [email],
        subject: `Booking Confirmation: ${title}`,
        text: `Successfully booked "${title}" for ${datesCount} session(s) starting ${selectedDate}.\nNotes: ${note || 'None'}`
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: data });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}