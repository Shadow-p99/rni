// pm2 — processus « rni-api » (cf. §1.3 / §8 Exploitation)
module.exports = {
  apps: [
    {
      name: 'rni-api',
      cwd: '/srv/nodejs/rni',
      script: 'dist/main.js',
      node_args: '--enable-source-maps',
      // 1 seule instance : le cache applicatif est en mémoire (cf. README « Cache applicatif »)
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        APP_PORT: 8096,
        API_PREFIX: 'rni/api',
        // PG_HOST / PG_PORT / PG_USER / PG_PASSWORD / PG_DATABASE : fournis par /srv/nodejs/rni/.env
        // NODE_EXTRA_CA_CERTS : /etc/ssl/certs/ca-interne.pem
      },
      out_file: '/var/log/rni-api/out.log',
      error_file: '/var/log/rni-api/error.log',
      time: true,
    },
  ],
};
