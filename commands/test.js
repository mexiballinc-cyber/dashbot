const { SlashCommandBuilder } = require('discord.js');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('Prueba si el bot responde'),

  async execute(interaction) {
    try {
      await interaction.reply({ content: '✅ El bot está funcionando correctamente!' });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '❌ Error en el comando de prueba' });
    }
  }
};
