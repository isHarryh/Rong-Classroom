/**
 * PM2 configuration.
 * @see https://pm2.keymetrics.io/
 */
module.exports = {
  apps: [
    {
      name: "rong-classroom",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      port: 3906,
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
