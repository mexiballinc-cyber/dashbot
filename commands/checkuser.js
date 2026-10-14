// dash-bot/commands/checkuser.js
const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

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
    await interaction.deferReply({ flags: 64 }).catch(() => {});

    const userId = interaction.options.getString('userid');
    const db = getDatabase();

    try {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
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
      console.error('Error en checkuser:', err);
      return interaction.editReply({ content: '⚠️ Error al consultar la base de datos.' });
    }
  }
};
