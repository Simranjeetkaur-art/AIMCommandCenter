module.exports = {
  apps: [
    {
      name: "aim-api",
      cwd: "/opt/aim/apps/api",
      script: "dist/main.js",
      interpreter: "node",
      env: { NODE_ENV: "production" },
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "aim-web",
      cwd: "/opt/aim/apps/web",
      script: "/usr/bin/npm",
      args: "start",
      interpreter: "none",
      env: { NODE_ENV: "production" },
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
