const db = require('../config/database');

// Хелперы для форматирования
const formatFullName = (lastName, firstName) => {
  return [lastName, firstName].filter(Boolean).join(' ') || 'Не назначен';
};

const formatInstallers = (installers) => {
  return installers.map(i => ({
    installer_id: i.installer_id,
    user_id: i.user_id,
    last_name: i.last_name,
    first_name: i.first_name,
    email: i.email,
    full_name: formatFullName(i.last_name, i.first_name)
  }));
};

const getAllCrews = async (req, res) => {
  try {
    const crews = await db('Crew')
      .select(
        'Crew.crew_id',
        'Crew.foreman_id',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .count('Crew_Installer.installer_id as installer_count')
      .leftJoin('Foreman', 'Crew.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .leftJoin('Crew_Installer', 'Crew.crew_id', 'Crew_Installer.crew_id')
      .groupBy('Crew.crew_id', 'Crew.foreman_id', 'Foreman_User.last_name', 'Foreman_User.first_name')
      .orderBy('Crew.crew_id', 'asc');

    const formattedCrews = crews.map(crew => ({
      crew_id: crew.crew_id,
      foreman_id: crew.foreman_id,
      foreman_name: formatFullName(crew.foreman_last_name, crew.foreman_first_name),
      installer_count: parseInt(crew.installer_count) || 0
    }));

    res.status(200).json({
      status: 'success',
      data: formattedCrews
    });
  } catch (error) {
    console.error('Get all crews error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка бригад.'
    });
  }
};

const getCrewById = async (req, res) => {
  try {
    const { id } = req.params;

    const crew = await db('Crew')
      .select(
        'Crew.crew_id',
        'Crew.foreman_id',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name',
        'Foreman_User.email as foreman_email'
      )
      .leftJoin('Foreman', 'Crew.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('Crew.crew_id', id)
      .first();

    if (!crew) {
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    const installers = await db('Crew_Installer')
      .select(
        'Installer.installer_id',
        'Installer.user_id',
        'Installer_User.last_name',
        'Installer_User.first_name',
        'Installer_User.email'
      )
      .join('Installer', 'Crew_Installer.installer_id', 'Installer.installer_id')
      .join('User as Installer_User', 'Installer.user_id', 'Installer_User.user_id')
      .where('Crew_Installer.crew_id', id);

    const result = {
      crew_id: crew.crew_id,
      foreman_id: crew.foreman_id,
      foreman_name: formatFullName(crew.foreman_last_name, crew.foreman_first_name),
      foreman_email: crew.foreman_email,
      installers: formatInstallers(installers),
      installer_count: installers.length
    };

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Get crew by id error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении бригады.'
    });
  }
};

const createCrew = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { foremanId, installerIds = [] } = req.body;

    if (!foremanId) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Не указан бригадир.'
      });
    }

    // Проверяем существование бригадира
    const foreman = await trx('Foreman')
      .where('foreman_id', foremanId)
      .first();

    if (!foreman) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Бригадир не найден.'
      });
    }

    // Проверяем, не является ли бригадир уже членом другой бригады
    const existingCrew = await trx('Crew')
      .where('foreman_id', foremanId)
      .first();

    if (existingCrew) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Этот бригадир уже назначен в другую бригаду.'
      });
    }

    // Создаем бригаду
    const [crewId] = await trx('Crew')
      .insert({ foreman_id: foremanId })
      .returning('crew_id');

    // Добавляем монтажников
    if (installerIds.length > 0) {
      // Проверяем, что монтажники существуют и не заняты в других бригадах
      const installers = await trx('Installer')
        .whereIn('installer_id', installerIds)
        .select('installer_id');

      if (installers.length !== installerIds.length) {
        await trx.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Один или несколько монтажников не найдены.'
        });
      }

      // Проверяем, не заняты ли монтажники в других бригадах
      const busyInstallers = await trx('Crew_Installer')
        .whereIn('installer_id', installerIds)
        .select('installer_id');

      if (busyInstallers.length > 0) {
        await trx.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Один или несколько монтажников уже состоят в других бригадах.'
        });
      }

      const crewInstallers = installerIds.map(installerId => ({
        crew_id: crewId,
        installer_id: installerId
      }));

      await trx('Crew_Installer').insert(crewInstallers);
    }

    await trx.commit();

    // Получаем созданную бригаду
    const crew = await db('Crew')
      .select(
        'Crew.crew_id',
        'Crew.foreman_id',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .leftJoin('Foreman', 'Crew.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('Crew.crew_id', crewId)
      .first();

    const crewInstallers = await db('Crew_Installer')
      .select(
        'Installer.installer_id',
        'Installer.user_id',
        'Installer_User.last_name',
        'Installer_User.first_name',
        'Installer_User.email'
      )
      .join('Installer', 'Crew_Installer.installer_id', 'Installer.installer_id')
      .join('User as Installer_User', 'Installer.user_id', 'Installer_User.user_id')
      .where('Crew_Installer.crew_id', crewId);

    const result = {
      crew_id: crew.crew_id,
      foreman_id: crew.foreman_id,
      foreman_name: formatFullName(crew.foreman_last_name, crew.foreman_first_name),
      installers: formatInstallers(crewInstallers),
      installer_count: crewInstallers.length
    };

    res.status(201).json({
      status: 'success',
      data: result,
      message: 'Бригада успешно создана'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Create crew error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при создании бригады.'
    });
  }
};

const updateCrew = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;
    const { foremanId, installerIds } = req.body;

    // Проверяем существование бригады
    const crew = await trx('Crew').where('crew_id', id).first();
    if (!crew) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    // Обновляем бригадира если указан
    if (foremanId !== undefined) {
      if (!foremanId) {
        await trx.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Не указан бригадир.'
        });
      }

      const foreman = await trx('Foreman').where('foreman_id', foremanId).first();
      if (!foreman) {
        await trx.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'Бригадир не найден.'
        });
      }

      // Проверяем, не занят ли бригадир в другой бригаде
      const existingCrew = await trx('Crew')
        .where('foreman_id', foremanId)
        .whereNot('crew_id', id)
        .first();

      if (existingCrew) {
        await trx.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Этот бригадир уже назначен в другую бригаду.'
        });
      }

      await trx('Crew')
        .where('crew_id', id)
        .update({ foreman_id: foremanId });
    }

    // Обновляем монтажников
    if (installerIds !== undefined) {
      // Удаляем старые связи
      await trx('Crew_Installer').where('crew_id', id).del();

      // Добавляем новые связи
      if (installerIds.length > 0) {
        // Проверяем существование монтажников
        const installers = await trx('Installer')
          .whereIn('installer_id', installerIds)
          .select('installer_id');

        if (installers.length !== installerIds.length) {
          await trx.rollback();
          return res.status(400).json({
            status: 'error',
            message: 'Один или несколько монтажников не найдены.'
          });
        }

        // Проверяем, не заняты ли в других бригадах
        const busyInstallers = await trx('Crew_Installer')
          .whereIn('installer_id', installerIds)
          .whereNot('crew_id', id)
          .select('installer_id');

        if (busyInstallers.length > 0) {
          await trx.rollback();
          return res.status(400).json({
            status: 'error',
            message: 'Один или несколько монтажников уже состоят в других бригадах.'
          });
        }

        const crewInstallers = installerIds.map(installerId => ({
          crew_id: parseInt(id),
          installer_id: installerId
        }));

        await trx('Crew_Installer').insert(crewInstallers);
      }
    }

    await trx.commit();

    // Получаем обновленную бригаду
    const updatedCrew = await db('Crew')
      .select(
        'Crew.crew_id',
        'Crew.foreman_id',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .leftJoin('Foreman', 'Crew.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('Crew.crew_id', id)
      .first();

    const crewInstallers = await db('Crew_Installer')
      .select(
        'Installer.installer_id',
        'Installer.user_id',
        'Installer_User.last_name',
        'Installer_User.first_name',
        'Installer_User.email'
      )
      .join('Installer', 'Crew_Installer.installer_id', 'Installer.installer_id')
      .join('User as Installer_User', 'Installer.user_id', 'Installer_User.user_id')
      .where('Crew_Installer.crew_id', id);

    const result = {
      crew_id: updatedCrew.crew_id,
      foreman_id: updatedCrew.foreman_id,
      foreman_name: formatFullName(updatedCrew.foreman_last_name, updatedCrew.foreman_first_name),
      installers: formatInstallers(crewInstallers),
      installer_count: crewInstallers.length
    };

    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Бригада успешно обновлена'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Update crew error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при обновлении бригады.'
    });
  }
};

const addInstaller = async (req, res) => {
  try {
    const { id } = req.params;
    const { installerId } = req.body;

    if (!installerId) {
      return res.status(400).json({
        status: 'error',
        message: 'Не указан ID монтажника.'
      });
    }

    // Проверяем существование бригады
    const crew = await db('Crew').where('crew_id', id).first();
    if (!crew) {
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    // Проверяем существование монтажника
    const installer = await db('Installer').where('installer_id', installerId).first();
    if (!installer) {
      return res.status(404).json({
        status: 'error',
        message: 'Монтажник не найден.'
      });
    }

    // Проверяем, не добавлен ли уже в эту бригаду
    const existingInCrew = await db('Crew_Installer')
      .where({
        crew_id: id,
        installer_id: installerId
      })
      .first();

    if (existingInCrew) {
      return res.status(400).json({
        status: 'error',
        message: 'Монтажник уже в этой бригаде.'
      });
    }

    // Проверяем, не состоит ли в другой бригаде
    const busyInOtherCrew = await db('Crew_Installer')
      .where('installer_id', installerId)
      .whereNot('crew_id', id)
      .first();

    if (busyInOtherCrew) {
      return res.status(400).json({
        status: 'error',
        message: 'Монтажник уже состоит в другой бригаде.'
      });
    }

    await db('Crew_Installer').insert({
      crew_id: id,
      installer_id: installerId
    });

    res.status(201).json({
      status: 'success',
      message: 'Монтажник добавлен в бригаду.'
    });
  } catch (error) {
    console.error('Add installer error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при добавлении монтажника.'
    });
  }
};

const removeInstaller = async (req, res) => {
  try {
    const { crewId, installerId } = req.params;

    const deleted = await db('Crew_Installer')
      .where({
        crew_id: crewId,
        installer_id: installerId
      })
      .del();

    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'Монтажник не найден в бригаде.'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Монтажник удален из бригады.'
    });
  } catch (error) {
    console.error('Remove installer error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении монтажника.'
    });
  }
};

const deleteCrew = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;

    const crew = await trx('Crew').where('crew_id', id).first();
    if (!crew) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    // Проверяем, есть ли связанные заявки через исполнителей
    const linkedOrders = await trx('WorkOrder')
      .join('Performer', 'WorkOrder.performer_id', 'Performer.performer_id')
      .where('Performer.crew_id', id)
      .first();

    if (linkedOrders) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Невозможно удалить бригаду, так как она связана с активными заявками.'
      });
    }

    // Удаляем исполнителей, связанных с бригадой
    await trx('Performer').where('crew_id', id).del();

    // Удаляем связи с монтажниками
    await trx('Crew_Installer').where('crew_id', id).del();

    // Удаляем бригаду
    await trx('Crew').where('crew_id', id).del();

    await trx.commit();

    res.status(200).json({
      status: 'success',
      message: 'Бригада успешно удалена.'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Delete crew error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении бригады.'
    });
  }
};

module.exports = {
  getAllCrews,
  getCrewById,
  createCrew,
  updateCrew,
  addInstaller,
  removeInstaller,
  deleteCrew
};