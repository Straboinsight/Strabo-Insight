exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { email } = JSON.parse(event.body);

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email is required' }) };
  }

  const response = await fetch('https://api.beehiiv.com/v2/publications/pub_ec3537b3-f3b0-40cc-aa8c-692a9f88355d/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`
    },
    body: JSON.stringify({
      email,
      reactivate_existing: false,
      send_welcome_email: true
    })
  });

  if (!response.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Subscription failed' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
