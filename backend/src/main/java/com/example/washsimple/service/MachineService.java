package com.example.washsimple.service;

import com.example.washsimple.model.Machine;
import com.example.washsimple.model.QueueEntry;
import com.example.washsimple.repo.MachineRepository;
import com.example.washsimple.repo.QueueEntryRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

@Service
public class MachineService {
    private final MachineRepository machineRepo;
    private final QueueEntryRepository queueRepo;
    private final SimpMessagingTemplate messaging;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);
    private final Map<Long, ScheduledFuture<?>> tasks = new ConcurrentHashMap<>();

    public MachineService(MachineRepository machineRepo, QueueEntryRepository queueRepo, SimpMessagingTemplate messaging){
        this.machineRepo = machineRepo;
        this.queueRepo = queueRepo;
        this.messaging = messaging;
    }

    @PostConstruct
    public void init(){
        if(machineRepo.count()==0){
            for(int i=1;i<=5;i++){
                Machine m = new Machine();
                m.setName("Machine "+i);
                m.setInUse(false);
                machineRepo.save(m);
            }
        }
        scheduler.scheduleAtFixedRate(this::broadcast,0,1,TimeUnit.SECONDS);
    }

    public List<Machine> list(){ return machineRepo.findAll(); }

    public synchronized Map<String,Object> joinQueue(Long machineId, Long userId){
        Optional<Machine> om = machineRepo.findById(machineId);
        if (!om.isPresent()) return Map.of("error","notfound");
        Machine m = om.get();

        if(!m.isInUse()){
            // direct assignment not allowed until user physically starts; we'll enqueue and indicate position 0 -> allowed to start immediately
        }
        QueueEntry qe = new QueueEntry();
        qe.setMachineId(machineId);
        qe.setUserId(userId);
        qe.setCreatedAt(Instant.now());
        queueRepo.save(qe);
        int pos = queueRepo.findByMachineIdOrderByCreatedAt(machineId).size();
        broadcast();
        return Map.of("queued", true, "position", pos);
    }

    public synchronized Map<String,Object> startWashing(Long machineId, Long userId, int minutes){
        Optional<Machine> om = machineRepo.findById(machineId);
        if(om.isEmpty()) return Map.of("error","notfound");
        Machine m = om.get();
        // remove user's queue entry for this machine if present
        List<QueueEntry> q = queueRepo.findByMachineIdOrderByCreatedAt(machineId);
        q.stream().filter(e -> e.getUserId().equals(userId)).findFirst().ifPresent(queueRepo::delete);
        if(m.isInUse()){
            return Map.of("error","in_use");
        }
        m.setInUse(true);
        m.setCurrentUserId(userId);
        Instant end = Instant.now().plusSeconds(minutes*60L);
        m.setEndTime(end);
        machineRepo.save(m);
        scheduleEnd(m);
        broadcast();
        return Map.of("started", true, "endTime", end.toString());
    }

    private void scheduleEnd(Machine m){
        ScheduledFuture<?> prev = tasks.remove(m.getId());
        if(prev!=null) prev.cancel(true);
        long delay = m.getEndTime().getEpochSecond() - Instant.now().getEpochSecond();
        if(delay<0) delay=0;
        ScheduledFuture<?> f = scheduler.schedule(() -> finish(m.getId()), delay, TimeUnit.SECONDS);
        tasks.put(m.getId(), f);
    }

    private synchronized void finish(Long machineId){
        Optional<Machine> om = machineRepo.findById(machineId);
        if(om.isEmpty()) return;
        Machine m = om.get();
        m.setInUse(false);
        m.setCurrentUserId(null);
        m.setEndTime(null);
        machineRepo.save(m);
        // promote next in queue
        List<QueueEntry> q = queueRepo.findByMachineIdOrderByCreatedAt(machineId);
        if(!q.isEmpty()){
            QueueEntry next = q.get(0);
            queueRepo.delete(next);
            m.setInUse(true);
            m.setCurrentUserId(next.getUserId());
            Instant end = Instant.now().plusSeconds(50*60L); // default 50 minutes for promoted user
            m.setEndTime(end);
            machineRepo.save(m);
            scheduleEnd(m);
        }
        broadcast();
    }

    private void broadcast(){
        List<Machine> machines = machineRepo.findAll();
        List<Map<String,Object>> out = new ArrayList<>();
        for(Machine m: machines){
            Map<String,Object> mm = new HashMap<>();
            mm.put("id", m.getId());
            mm.put("name", m.getName());
            mm.put("inUse", m.isInUse());
            mm.put("currentUserId", m.getCurrentUserId());
            mm.put("endTime", m.getEndTime()==null?null:m.getEndTime().toString());
            mm.put("queueSize", queueRepo.findByMachineIdOrderByCreatedAt(m.getId()).size());
            out.add(mm);
        }
        messaging.convertAndSend("/topic/machines", out);
    }
}
