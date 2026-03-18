//————————————————————————//
  const axios = require('axios');

  // Facebook video downloader — tries multiple APIs with automatic fallback
  const fdown = {
    download: async (url) => {
      const _apis = [
        // API 1: siputzx (Indonesian public API)
        async () => {
          const r = await axios.get('https://api.siputzx.my.id/api/d/fb', {
            params: { url },
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const d = r.data;
          if (!d?.status || !d?.data) throw new Error('No data');
          const item = d.data;
          return [{
            title: item.title || 'Facebook Video',
            description: item.description || '',
            duration: item.duration || '',
            hdQualityLink: item.hdQuality || item.hdUrl || item.hd || null,
            normalQualityLink: item.normalQuality || item.sdUrl || item.sd || item.url || null
          }];
        },
        // API 2: ryzendesu (another public API)
        async () => {
          const r = await axios.get('https://api.ryzendesu.vip/api/downloader/fbdl', {
            params: { url },
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const d = r.data;
          if (!d?.success && !d?.data) throw new Error('No data');
          const item = d.data || d;
          return [{
            title: item.title || 'Facebook Video',
            description: '',
            duration: item.duration || '',
            hdQualityLink: item.hd || item.hdUrl || null,
            normalQualityLink: item.sd || item.sdUrl || item.url || null
          }];
        },
        // API 3: aemt (another reliable public API)
        async () => {
          const r = await axios.get('https://api.aemt.me/fbdl', {
            params: { url },
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const d = r.data;
          if (!d?.result) throw new Error('No result');
          const item = d.result;
          return [{
            title: item.title || 'Facebook Video',
            description: '',
            duration: item.duration || '',
            hdQualityLink: item.hd || null,
            normalQualityLink: item.sd || item.url || null
          }];
        }
      ];

      for (const api of _apis) {
        try {
          const result = await api();
          if (result && result[0] && (result[0].hdQualityLink || result[0].normalQualityLink)) {
            return result;
          }
        } catch (e) {
          continue; // try next API
        }
      }
      return [];
    }
  };

  module.exports = { fdown };
  