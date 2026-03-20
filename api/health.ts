export default async function handler(req: Request): Promise<Response> {
  return new Response(
    JSON.stringify({ hasServerKey: !!process.env.OPENAI_API_KEY }),
    { headers: { "Content-Type": "application/json" } },
  );
}
