/**
 * Separate Backend Server for Heavy Operations
 * 
 * This server handles resource-intensive operations that can't run on Vercel:
 * - YouTube video downloads with yt-dlp
 * - FFmpeg video processing and merging
 * - Reddit video downloads with audio merging
 * - Facebook video downloads
 * - Large file proxying/streaming
 * 
 * Deploy this on: Railway, Render, Heroku, DigitalOcean, AWS EC2, or any VPS
 * 
 * Environment Variables Required:
 * - PORT: Server port (default: 3001)
 * - REDDIT_CLIENT_ID: Reddit API client ID (optional)
 * - REDDIT_CLIENT_SECRET: Reddit API secret (optional)
 * - ALLOWED_ORIGINS: Comma-separated list of allowed origins for CORS
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:55964', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    server: 'backend-heavy-operations'
  });
});

// ─── YouTube Download Endpoint ───────────────────────────────────────
app.post('/api/youtube/download', async (req, res) => {
  const { url, format, quality } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`[YouTube] Download request: ${url}, format: ${format}, quality: ${quality}`);

  try {
    // Check if yt-dlp is available
    const ytDlpPath = 'yt-dlp'; // Assumes yt-dlp is in PATH
    
    // Build yt-dlp command based on format
    let ytDlpArgs = [
      '--no-playlist',
      '--no-warnings',
      '--newline',
    ];

    if (format === 'audio') {
      ytDlpArgs.push(
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', '-'
      );
    } else {
      // Video with audio
      const formatString = quality === '4k' ? 'bestvideo[height<=2160]+bestaudio/best' 
        : quality === '1440p' ? 'bestvideo[height<=1440]+bestaudio/best'
        : quality === '1080p' ? 'bestvideo[height<=1080]+bestaudio/best'
        : quality === '720p' ? 'bestvideo[height<=720]+bestaudio/best'
        : 'bestvideo+bestaudio/best';
      
      ytDlpArgs.push(
        '-f', formatString,
        '--merge-output-format', 'mp4',
        '-o', '-'
      );
    }

    ytDlpArgs.push(url);

    const ytDlp = spawn(ytDlpPath, ytDlpArgs);
    
    // Set appropriate headers
    res.setHeader('Content-Type', format === 'audio' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="video.${format === 'audio' ? 'mp3' : 'mp4'}"`);

    // Pipe yt-dlp output directly to response
    ytDlp.stdout.pipe(res);

    ytDlp.stderr.on('data', (data) => {
      const message = data.toString();
      console.log(`[YouTube] ${message}`);
      
      // Send progress updates as Server-Sent Events (optional)
      // You could implement SSE here for real-time progress
    });

    ytDlp.on('error', (error) => {
      console.error('[YouTube] Process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download process failed' });
      }
    });

    ytDlp.on('close', (code) => {
      console.log(`[YouTube] Process exited with code ${code}`);
      if (code !== 0 && !res.headersSent) {
        res.status(500).json({ error: `Download failed with code ${code}` });
      }
    });

  } catch (error) {
    console.error('[YouTube] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── YouTube Info Endpoint ───────────────────────────────────────────
app.post('/api/youtube/info', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`[YouTube] Info request: ${url}`);

  try {
    const ytDlp = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      url
    ]);

    let jsonData = '';

    ytDlp.stdout.on('data', (data) => {
      jsonData += data.toString();
    });

    ytDlp.stderr.on('data', (data) => {
      console.error(`[YouTube] stderr: ${data}`);
    });

    ytDlp.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: 'Failed to fetch video info' });
      }

      try {
        const videoInfo = JSON.parse(jsonData);
        res.json({
          success: true,
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail,
          duration: videoInfo.duration,
          uploader: videoInfo.uploader,
          formats: videoInfo.formats?.map(f => ({
            format_id: f.format_id,
            ext: f.ext,
            quality: f.quality,
            height: f.height,
            width: f.width,
            filesize: f.filesize
          })) || []
        });
      } catch (parseError) {
        console.error('[YouTube] Parse error:', parseError);
        res.status(500).json({ error: 'Failed to parse video info' });
      }
    });

  } catch (error) {
    console.error('[YouTube] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Reddit Download Endpoint (with audio merge) ────────────────────
app.post('/api/reddit/download', async (req, res) => {
  const { videoUrl, audioUrl } = req.body;
  
  if (!videoUrl) {
    return res.status(400).json({ error: 'Video URL is required' });
  }

  console.log(`[Reddit] Merge request: video=${videoUrl}, audio=${audioUrl}`);

  try {
    // If no audio URL, just proxy the video
    if (!audioUrl) {
      const videoRes = await fetch(videoUrl);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="reddit-video.mp4"');
      videoRes.body.pipe(res);
      return;
    }

    // Use ffmpeg to merge video and audio
    const ffmpeg = require('ffmpeg-static');
    const ffmpegProcess = spawn(ffmpeg, [
      '-i', videoUrl,
      '-i', audioUrl,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-strict', 'experimental',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov',
      'pipe:1'
    ]);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="reddit-video.mp4"');

    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (data) => {
      console.log(`[Reddit] ffmpeg: ${data}`);
    });

    ffmpegProcess.on('error', (error) => {
      console.error('[Reddit] ffmpeg error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Merge process failed' });
      }
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`[Reddit] ffmpeg exited with code ${code}`);
    });

  } catch (error) {
    console.error('[Reddit] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Media Proxy Endpoint (for bypassing CORS) ──────────────────────
app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  console.log(`[Proxy] Request: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
    }

    // Forward content type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Stream the response
    response.body.pipe(res);

  } catch (error) {
    console.error('[Proxy] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Backend Server (Heavy Operations) running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`\n📦 Services:`);
  console.log(`   - YouTube downloads (yt-dlp)`);
  console.log(`   - FFmpeg video processing`);
  console.log(`   - Reddit video merging`);
  console.log(`   - Media proxy/CORS bypass`);
  console.log(`\n⚠️  Make sure yt-dlp is installed and in PATH`);
  console.log(`   Install: pip install yt-dlp\n`);
});

module.exports = app;
