import { createApp } from '../server/src/app.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error('❌ Serverless handler initialization error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'INITIALIZATION_ERROR',
          message: 'Serverless application failed to initialize',
        },
      }),
    );
  }
}
