// dash-bot/commands/checkuser.js
const { SlashCommandBuilder } = require('discord.js');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkuser')
    .setDescription('Verifica si una ID de usuario existe en la base de datos o en el servidor')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('La ID de Discord a verificar')
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.options.getString('userid');
    const db = admin.database();

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Buscar en el servidor de Discord
      const member = await interaction.guild.members.fetch(userId).catch(() => null);

      // 2. Buscar en Realtime Database
      const userSnap = await db.ref(`users/${userId}`).once('value');

      if (!member && !userSnap.exists()) {
        return interaction.editReply({
          content: `❌ **ID no encontrada**: La ID \`${userId}\` no pertenece a ningún miembro de este servidor ni está registrada en la web.`
        });
      }

      const userData = userSnap.exists() ? userSnap.val() : null;
      const tag = member ? member.user.tag : (userData?.username || 'Usuario Registrado');

      return interaction.editReply({
        content: `✅ **ID Confirmada**: **${tag}** (\`${userId}\`) es una ID válida.`
      });
    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: '⚠️ Error al consultar la base de datos.' });
    }
  }
};