export async function isVerifiedGoogleBot(ip: string): Promise<boolean> {
  try {
    // 1. REVERSE LOOKUP (PTR)
    // Convert IP to PTR format: 66.249.66.1 -> 1.66.249.66.in-addr.arpa
    const reversedIp = ip.split('.').reverse().join('.') + '.in-addr.arpa';

    // Query Google's DoH API for the PTR record
    const ptrResponse = await fetch(`https://dns.google/resolve?name=${reversedIp}&type=PTR`);
    const ptrData = await ptrResponse.json();

    // If no Answer, it's not a valid bot
    if (!ptrData.Answer) return false;

    // Get the hostname (e.g., crawl-66-249-66-1.googlebot.com.)
    const hostname = ptrData.Answer[0].data;

    // 2. VALIDATE DOMAIN (Strict Check)
    // Must end in googlebot.com or google.com
    if (!hostname.endsWith('.googlebot.com.') && !hostname.endsWith('.google.com.')) {
      return false;
    }

    // 3. FORWARD LOOKUP (A)
    // Verify that this hostname actually points back to the original IP
    const aResponse = await fetch(`https://dns.google/resolve?name=${hostname}&type=A`);
    const aData = await aResponse.json();

    if (!aData.Answer) return false;

    // Check if any of the returned IPs match the original IP
    const match = aData.Answer.some((record: { data: string }) => record.data === ip);

    return match;

  } catch (error) {
    console.error('DoH Verification Failed:', error);
    return false; // Fail closed (block if unsure)
  }
}
