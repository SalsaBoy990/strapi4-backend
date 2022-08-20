module.exports = ({ env }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', '127.0.0.1'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'starcity'),
      user: env('DATABASE_USERNAME', 'gulacsi'),
      password: env('DATABASE_PASSWORD', 'alma5578'),
      ssl: env.bool('DATABASE_SSL', false),
    },
  },
});
