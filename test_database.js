// test_database.js

const { Client } = require('pg');
const { expect } = require('chai');

describe('Database Test', function () {
  let client;

  before(async function () {
    client = new Client({
      user: 'testuser',
      host: 'localhost',
      database: 'testdb',
      password: 'password',
      port: 5432,
    });
    await client.connect();
  });

  after(async function () {
    await client.end();
  });

  beforeEach(async function () {
    // Disable triggers temporarily for cleanup
    await client.query('ALTER TABLE users DISABLE TRIGGER user_audit_trigger');
    
    // Clean up any test data
    await client.query('DELETE FROM user_audit_logs');
    await client.query('DELETE FROM users');
    
    // Re-enable triggers
    await client.query('ALTER TABLE users ENABLE TRIGGER user_audit_trigger');
  });

  it('should create a user with valid credentials', async function () {
    try {
      await client.query(`
        INSERT INTO users (
          email,
          username,
          password_hash,
          first_name,
          last_name,
          date_of_birth,
          phone_number
        ) VALUES (
          'test.user@example.com',
          'testuser123',
          '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.i77i',
          'Test',
          'User',
          '1990-01-15',
          '+1-555-000-0000'
        )`);
      
      // Query to verify the user was created
      const result = await client.query(`
        SELECT * FROM users 
        WHERE email = 'test.user@example.com'
      `);
      
      expect(result.rows.length).to.equal(1);
      expect(result.rows[0].username).to.equal('testuser123');
    } catch (error) {
      throw new Error('Failed to create user: ' + error.message);
    }
  });

  it('should reject duplicate usernames', async function () {
    // First insert
    await client.query(`
      INSERT INTO users (
        email,
        username,
        password_hash,
        first_name,
        last_name,
        date_of_birth,
        phone_number
      ) VALUES (
        'user1@example.com',
        'uniqueuser',
        '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.i77i',
        'First',
        'User',
        '1990-01-15',
        '+1-555-000-0001'
      )`);

    // Try to insert with same username but different email
    try {
      await client.query(`
        INSERT INTO users (
          email,
          username,
          password_hash,
          first_name,
          last_name,
          date_of_birth,
          phone_number
        ) VALUES (
          'user2@example.com',
          'uniqueuser',
          '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.i77i',
          'Second',
          'User',
          '1992-01-15',
          '+1-555-000-0002'
        )`);
      throw new Error('Should not reach this point');
    } catch (error) {
      expect(error.code).to.equal('23505'); // PostgreSQL unique violation error code
    }
  });

  it('should reject users younger than 13 years old', async function () {
    const tooYoungDate = new Date();
    tooYoungDate.setFullYear(tooYoungDate.getFullYear() - 12);
    
    try {
      await client.query(`
        INSERT INTO users (
          email,
          username,
          password_hash,
          first_name,
          last_name,
          date_of_birth,
          phone_number
        ) VALUES (
          'young@example.com',
          'younguser',
          '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.i77i',
          'Young',
          'User',
          $1,
          '+1-555-000-0003'
        )`, [tooYoungDate.toISOString()]);
      throw new Error('Should not reach this point');
    } catch (error) {
      expect(error.code).to.equal('23514'); // PostgreSQL check violation error code
    }
  });
});
