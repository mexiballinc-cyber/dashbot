const { SlashCommandBuilder } = require('discord.js');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Registra tu usuario de Discord en DashList y Firebase'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const db = admin.database();
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const avatar = interaction.user.avatar
      ? `https://cdn.discordapp.com/avatars/${userId}/${interaction.user.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    try {
      const userRef = db.ref(`users/${userId}`);
      const leaderboardRef = db.ref(`leaderboard/${userId}`);

      const existingUser = await userRef.once('value');
      const existingLeaderboard = await leaderboardRef.once('value');

      await userRef.set({
        discordId: userId,
        username,
        tag: interaction.user.tag,
        avatar,
        registeredAt: existingUser.exists() ? (existingUser.val().registeredAt || Date.now()) : Date.now(),
        lastLogin: Date.now()
      });

      await leaderboardRef.set({
        ...(existingLeaderboard.exists() ? existingLeaderboard.val() : {}),
        name: username,
        discordId: userId,
        avatar,
        country: existingLeaderboard.exists() && existingLeaderboard.val().country ? existingLeaderboard.val().country : 'N/A',
        points: existingLeaderboard.exists() ? (existingLeaderboard.val().points || 0) : 0,
        createdCount: existingLeaderboard.exists() ? (existingLeaderboard.val().createdCount || 0) : 0,
        verifiedCount: existingLeaderboard.exists() ? (existingLeaderboard.val().verifiedCount || 0) : 0,
        lastLogin: Date.now()
      });

      return interaction.editReply({
        content: `✅ **Registrado en DashList** \nTu Discord ID: \`${userId}\` \nNickname: **${username}**`
      });
    } catch (error) {
      console.error(error);
      return interaction.editReply({ content: '❌ Ocurrió un error al registrarte en DashList.' });
    }
  }
};
