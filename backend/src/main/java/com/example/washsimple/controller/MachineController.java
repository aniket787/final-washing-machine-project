package com.example.washsimple.controller;

import com.example.washsimple.service.MachineService;
import com.example.washsimple.model.QueueEntry;
import com.example.washsimple.model.Machine;
import com.example.washsimple.repo.MachineRepository;
import com.example.washsimple.repo.QueueEntryRepository;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/machines")
public class MachineController {
    private final MachineService service;
    private final MachineRepository machineRepo;
    private final QueueEntryRepository queueRepo;

    public MachineController(MachineService service, MachineRepository machineRepo, QueueEntryRepository queueRepo){
        this.service=service;
        this.machineRepo=machineRepo;
        this.queueRepo=queueRepo;
    }

    @GetMapping
    public List<?> list(){ return service.list(); }

    @PostMapping("/join")
    public Map<String,Object> join(@RequestBody Map<String,Object> body){
        Long machineId = Long.valueOf(body.get("machineId").toString());
        Long userId = Long.valueOf(body.get("userId").toString());
        int minutes = Integer.parseInt(body.getOrDefault("minutes",50).toString());
        return service.joinQueue(machineId, userId, minutes);
    }

    @PostMapping("/start")
    public Map<String,Object> start(@RequestBody Map<String,Object> body){
        Long machineId = Long.valueOf(body.get("machineId").toString());
        Long userId = Long.valueOf(body.get("userId").toString());
        int minutes = Integer.parseInt(body.getOrDefault("minutes", 50).toString());
        return service.startWashing(machineId, userId, minutes);
    }

    @GetMapping("/queue/{machineId}")
    public List<Map<String,Object>> getQueue(@PathVariable Long machineId){
        List<QueueEntry> queue = service.getQueue(machineId);
        return queue.stream().map(qe -> {
            Map<String,Object> m = new HashMap<>();
            m.put("userId", qe.getUserId());
            m.put("minutes", qe.getMinutes() != null ? qe.getMinutes() : 50);
            return m;
        }).collect(Collectors.toList());
    }

    @PostMapping("/reset")
    public Map<String,Object> resetAll(){
        // Clear all queues and machines
        queueRepo.deleteAll();
        machineRepo.deleteAll();

        // Reinitialize machines
        for(int i=1;i<=5;i++){
            Machine m = new Machine();
            m.setName("Machine "+i);
            m.setInUse(false);
            machineRepo.save(m);
        }

        return Map.of("reset", true);
    }
}