import { createApp } from '../server/src/app.js';
import { connectDB } from '../server/src/config/db.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    await connectDB();
    return app(req, res);
  } catch (error) {
    console.error('❌ Serverless handler error:', error.message || error);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Service temporarily unavailable. Please check database connection.',
        },
      }),
    );
  }
}
