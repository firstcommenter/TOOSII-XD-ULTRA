//————————————————————————//
  // Facebook Video Downloader
  // Powered by GiftedTech API
  //————————————————————————//
  const axios = require('axios');

  const fdown = {
      download: async (url) => {
          try {
              const res = await axios.get('https://api.giftedtech.co.ke/api/download/facebook', {
                  params: { apikey: 'gifted', url },
                  timeout: 20000,
                  headers: { 'User-Agent': 'Mozilla/5.0' }
              });
              const d = res.data;
              if (!d?.success || !d?.result) return [];
              const r = d.result;
              return [{
                  title: r.title || 'Facebook Video',
                  description: r.description || '',
                  duration: r.duration || '',
                  thumbnail: r.thumbnail || '',
                  hdQualityLink: r.hd_video || r.hd || null,
                  normalQualityLink: r.sd_video || r.sd || r.hd_video || null
              }];
          } catch (e) {
              console.log('[FB downloader error]', e.message);
              return [];
          }
      }
  };

  module.exports = { fdown };
  