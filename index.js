// dash-bot/index.js
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs');

const TARGET_GUILD_ID = '1555409817785344031';

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require('./firebase-key.json');
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://dashlist-3fbec-default-rtdb.firebaseio.com"
  });
}

const db = getDatabase();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commandsArray = [];

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
  commandsArray.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Cargando comandos Slash exclusivamente para el Servidor ID: ${TARGET_GUILD_ID}...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, TARGET_GUILD_ID),
      { body: commandsArray }
    );
    console.log('¡Comandos del Servidor cargados e instantáneos!');
  } catch (error) {
    console.error('Error al registrar comandos Slash:', error);
  }
})();

function listenForPendingItems() {
  // 1. Escuchar Niveles Pendientes
  db.ref('pending_levels').on('child_added', async (snapshot) => {
    try {
      const data = snapshot.val();
      const key = snapshot.key;
      if (!data || data.notified) return;

      await db.ref(`pending_levels/${key}`).update({ notified: true });

      const channelSnap = await db.ref('settings/channels/levelsChannelId').once('value');
      const channelId = channelSnap.val();
      if (!channelId) return;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setTitle(`📥 Nueva Solicitud de Nivel: ${data.name || 'Sin nombre'}`)
        .setColor(0x5865F2)
        .addFields(
          { name: 'Dificultad', value: String(data.difficulty || 'N/A'), inline: true },
          { name: 'ID del Nivel', value: String(data.gdId || 'N/A'), inline: true },
          { name: 'Creador (ID)', value: data.creatorId ? `<@${data.creatorId}> (\`${data.creatorId}\`)` : 'N/A', inline: true },
          { name: 'Verificador (ID)', value: data.verifierId ? `<@${data.verifierId}> (\`${data.verifierId}\`)` : 'N/A', inline: true }
        )
        .setFooter({ text: `Key: ${key}` });

      if (data.imgurUrl && typeof data.imgurUrl === 'string' && data.imgurUrl.startsWith('http')) {
        embed.setThumbnail(data.imgurUrl);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_level_${key}`).setLabel('Aceptar Nivel').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_level_${key}`).setLabel('Rechazar Nivel').setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('Error procesando child_added en pending_levels:', err);
    }
  });

  // 2. Escuchar Récords Pendientes
  db.ref('pending_records').on('child_added', async (snapshot) => {
    try {
      const data = snapshot.val();
      const key = snapshot.key;
      if (!data || data.notified) return;

      await db.ref(`pending_records/${key}`).update({ notified: true });

      const channelSnap = await db.ref('settings/channels/recordsChannelId').once('value');
      const channelId = channelSnap.val() || (await db.ref('settings/channels/levelsChannelId').once('value')).val();
      if (!channelId) return;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Nuevo Récord Enviado: ${data.levelName || 'Nivel Desconocido'}`)
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Jugador', value: String(data.playerName || 'Anónimo'), inline: true },
          { name: 'Progreso', value: `${data.progress || 0}%`, inline: true },
          { name: 'País', value: String(data.country || 'N/A'), inline: true },
          { name: 'Video Prueba', value: String(data.videoUrl || data.video || 'Sin enlace') }
        )
        .setFooter({ text: `Key: ${key}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_record_${key}`).setLabel('Aceptar Récord').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_record_${key}`).setLabel('Rechazar Récord').setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('Error procesando child_added en pending_records:', err);
    }
  });
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.guildId !== TARGET_GUILD_ID) {
    if (interaction.isRepliable()) {
      return interaction.reply({ content: '❌ Este bot está configurado para operar únicamente en su servidor oficial.', ephemeral: true });
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (command) {
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Error ejecutando /${interaction.commandName}:`, err);
        const errMessage = { content: '❌ Ocurrió un error al ejecutar el comando.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errMessage).catch(() => {});
        } else {
          await interaction.reply(errMessage).catch(() => {});
        }
      }
    }
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;

    try {
      if (customId.startsWith('accept_level_')) {
        const key = customId.replace('accept_level_', '');
        await interaction.deferUpdate();

        const pendingSnap = await db.ref(`pending_levels/${key}`).once('value');
        if (!pendingSnap.exists()) {
          return interaction.followUp({ content: '⚠️ Este nivel ya fue procesado.', ephemeral: true });
        }

        const levelData = pendingSnap.val();
        await db.ref('levels').push().set({ ...levelData, createdAt: Date.now() });

        if (levelData.creatorId) {
          const creatorRef = db.ref(`leaderboard/${levelData.creatorId}`);
          const creatorSnap = await creatorRef.once('value');
          const currentCreated = creatorSnap.exists() ? (creatorSnap.val().createdCount || 0) : 0;
          await creatorRef.update({
            name: levelData.creatorName || `User_${levelData.creatorId}`,
            createdCount: currentCreated + 1
          });
        }

        if (levelData.verifierId) {
          const verifierRef = db.ref(`leaderboard/${levelData.verifierId}`);
          const verifierSnap = await verifierRef.once('value');
          const currentVerified = verifierSnap.exists() ? (verifierSnap.val().verifiedCount || 0) : 0;
          await verifierRef.update({
            name: levelData.verifierName || `User_${levelData.verifierId}`,
            verifiedCount: currentVerified + 1
          });
        }

        await db.ref(`pending_levels/${key}`).remove();

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x57F287)
          .setTitle(`✅ Nivel Publicado y Leaderboard Actualizada`);
        await interaction.editReply({ embeds: [embed], components: [] });
      }

      if (customId.startsWith('accept_record_')) {
        const key = customId.replace('accept_record_', '');
        await interaction.deferUpdate();

        const pendingSnap = await db.ref(`pending_records/${key}`).once('value');
        if (!pendingSnap.exists()) {
          return interaction.followUp({ content: '⚠️ Este récord ya fue procesado.', ephemeral: true });
        }

        const recData = pendingSnap.val();
        const playerId = recData.userId || (recData.playerName ? recData.playerName.toLowerCase().replace(/\s+/g, '_') : 'unknown_user');
        const pointsToAdd = recData.progress === 100 ? 100 : Math.floor((recData.progress || 0) * 0.5);

        // 1. Actualizar Leaderboard del Jugador
        const playerRef = db.ref(`leaderboard/${playerId}`);
        const playerSnap = await playerRef.once('value');
        const currentPoints = playerSnap.exists() ? (playerSnap.val().points || 0) : 0;

        await playerRef.update({
          name: recData.playerName || 'Anónimo',
          points: currentPoints + pointsToAdd,
          country: recData.country || 'N/A'
        });

        // 2. Vincular el Récord directamente dentro del Nivel en Firebase para la Web
        const levelsSnap = await db.ref('levels').once('value');
        if (levelsSnap.exists()) {
          const levels = levelsSnap.val();
          const levelKey = Object.keys(levels).find(
            k => levels[k].name && levels[k].name.trim().toLowerCase() === (recData.levelName || '').trim().toLowerCase()
          );

          if (levelKey) {
            await db.ref(`levels/${levelKey}/records`).push().set({
              playerName: recData.playerName || 'Anónimo',
              progress: recData.progress || 100,
              videoUrl: recData.videoUrl || recData.video || '',
              userId: recData.userId || '',
              approvedAt: Date.now()
            });
          }
        }

        // 3. Eliminar de pendientes
        await db.ref(`pending_records/${key}`).remove();

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x57F287)
          .setTitle(`✅ Récord Aceptado: +${pointsToAdd} Puntos a ${recData.playerName || 'Jugador'}`);
        await interaction.editReply({ embeds: [embed], components: [] });
      }

      if (customId.startsWith('reject_level_')) {
        const key = customId.replace('reject_level_', '');
        await interaction.deferUpdate();
        await db.ref(`pending_levels/${key}`).remove();
        await interaction.editReply({ content: '❌ Solicitud de nivel rechazada y eliminada.', embeds: [], components: [] });
      }

      if (customId.startsWith('reject_record_')) {
        const key = customId.replace('reject_record_', '');
        await interaction.deferUpdate();
        await db.ref(`pending_records/${key}`).remove();
        await interaction.editReply({ content: '❌ Solicitud de récord rechazada y eliminada.', embeds: [], components: [] });
      }
    } catch (btnErr) {
      console.error('Error al procesar interacción de botón:', btnErr);
    }
  }
});

client.once('ready', () => {
  console.log(`🤖 DASH Bot encendido y protegido para el servidor ${TARGET_GUILD_ID}`);
  listenForPendingItems();
});

const http = require('http');
http.createServer((req, res) => res.end('DASH Bot Online 24/7')).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);
